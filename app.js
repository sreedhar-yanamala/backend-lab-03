/**
 * Lab 3: REST API, Query Parameters, Validation, Debugging
 * Course: Backend Development Fundamentals
 * College: Aurora
 * Faculty: Joel Prashanth D
 * Student: YANAMALA SREEDHAR
 */

const express = require("express");
const path = require("path");
const { initializeDB } = require("./database");

const app = express();

// Middleware to parse incoming JSON request bodies
app.use(express.json());

// Gracefully handle malformed JSON syntax errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      message: "Invalid JSON payload",
    });
  }
  next();
});

// Database instance reference
let db = null;

/**
 * Initialize Database and Start Server
 * 
 * Debugging Notes Included:
 * 1. EADDRINUSE: Using `process.env.PORT || 3000` allows dynamic port assignment
 *    if port 3000 is occupied by another process.
 * 2. Wrong import path: Explicitly using correct package names ('sqlite' and 'sqlite3')
 *    and exact relative paths prevents "Cannot find module" errors.
 * 3. No such table: Running CREATE TABLE IF NOT EXISTS ensures the 'books' table
 *    always exists before handling requests.
 * 4. Missing await: Every database operation (open, run, all, get) returns a Promise,
 *    so we must use `await` to get the actual result.
 */
const initializeDBAndServer = async () => {
  try {
    // Open SQLite database connection using database module
    db = await initializeDB();

    // Seed sample books if the table is currently empty
    const bookCount = await db.get("SELECT COUNT(*) AS count FROM books;");
    if (bookCount.count === 0) {
      const sampleBooks = [
        { title: "The Alchemist", author: "Paulo Coelho", price: 299 },
        { title: "Wings of Fire", author: "A.P.J. Abdul Kalam", price: 350 },
        { title: "Atomic Habits", author: "James Clear", price: 499 },
        { title: "The Hobbit", author: "J.R.R. Tolkien", price: 450 },
        { title: "Ikigai", author: "Hector Garcia", price: 299 },
        { title: "Rich Dad Poor Dad", author: "Robert Kiyosaki", price: 399 },
        { title: "Harry Potter", author: "J.K. Rowling", price: 599 },
        { title: "Think and Grow Rich", author: "Napoleon Hill", price: 250 },
      ];

      for (const book of sampleBooks) {
        await db.run(
          "INSERT INTO books (title, author, price) VALUES (?, ?, ?);",
          [book.title, book.author, book.price]
        );
      }
      console.log("Database initialized with sample books.");
    }

    // Configurable PORT for local development and cloud deployment (e.g. Render)
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error(`Database / Server Initialization Error: ${error.message}`);
    process.exit(1);
  }
};

// Start the server
initializeDBAndServer();

// ==========================================
// REST API ROUTES
// ==========================================

/**
 * 1. Root Endpoint
 * GET /
 * Purpose: Quick health check to verify API is active.
 * Status: 200 OK
 */
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Lab 3 REST API is running",
  });
});

/**
 * 2. GET All Books with Query Parameters
 * GET /books
 * Supports:
 * - search_q: partial search on title (default: "")
 * - order_by: column to sort by (default: "id", allowed: id, title, author, price)
 * - order: sort direction (default: "ASC", allowed: ASC, DESC)
 * - limit: number of books to return (default: 10)
 * - offset: number of books to skip (default: 0)
 * - min_price: filter books with price >= min_price
 * - max_price: filter books with price <= max_price
 */
app.get("/books", async (req, res) => {
  try {
    const {
      search_q = "",
      order_by = "id",
      order = "ASC",
      limit = 10,
      offset = 0,
      min_price,
      max_price,
    } = req.query;

    // --- Validation: order_by whitelist mapping ---
    const allowedOrderBy = {
      id: "id",
      title: "title",
      author: "author",
      price: "price",
    };
    const normalizedOrderBy = String(order_by).toLowerCase();
    if (!allowedOrderBy[normalizedOrderBy]) {
      return res.status(400).json({
        message: "Invalid order_by parameter. Allowed values are: id, title, author, price",
      });
    }

    // --- Validation: order whitelist mapping ---
    const allowedOrder = {
      ASC: "ASC",
      DESC: "DESC",
    };
    const normalizedOrder = String(order).toUpperCase();
    if (!allowedOrder[normalizedOrder]) {
      return res.status(400).json({
        message: "Invalid order parameter. Allowed values are: ASC, DESC",
      });
    }

    // --- Validation: limit & offset ---
    const parsedLimit = Number(limit);
    const parsedOffset = Number(offset);

    if (
      String(limit).trim() === "" ||
      isNaN(parsedLimit) ||
      !Number.isInteger(parsedLimit) ||
      parsedLimit <= 0
    ) {
      return res.status(400).json({
        message: "Limit must be a positive integer",
      });
    }

    if (
      String(offset).trim() === "" ||
      isNaN(parsedOffset) ||
      !Number.isInteger(parsedOffset) ||
      parsedOffset < 0
    ) {
      return res.status(400).json({
        message: "Offset must be a non-negative integer",
      });
    }

    // --- Validation: min_price & max_price ---
    let parsedMinPrice = null;
    let parsedMaxPrice = null;

    if (min_price !== undefined) {
      parsedMinPrice = Number(min_price);
      if (isNaN(parsedMinPrice) || String(min_price).trim() === "" || parsedMinPrice < 0) {
        return res.status(400).json({
          message: "min_price must be a valid non-negative number",
        });
      }
    }

    if (max_price !== undefined) {
      parsedMaxPrice = Number(max_price);
      if (isNaN(parsedMaxPrice) || String(max_price).trim() === "" || parsedMaxPrice < 0) {
        return res.status(400).json({
          message: "max_price must be a valid non-negative number",
        });
      }
    }

    if (parsedMinPrice !== null && parsedMaxPrice !== null && parsedMinPrice > parsedMaxPrice) {
      return res.status(400).json({
        message: "min_price cannot be greater than max_price",
      });
    }

    // --- Build Safe Parameterized SQL Query ---
    const conditions = [];
    const params = [];

    // Search query on title (case-insensitive LIKE)
    if (String(search_q).trim() !== "") {
      conditions.push("title LIKE ?");
      params.push(`%${String(search_q).trim()}%`);
    }

    // Price range filters
    if (parsedMinPrice !== null && parsedMaxPrice !== null) {
      conditions.push("price BETWEEN ? AND ?");
      params.push(parsedMinPrice, parsedMaxPrice);
    } else if (parsedMinPrice !== null) {
      conditions.push("price >= ?");
      params.push(parsedMinPrice);
    } else if (parsedMaxPrice !== null) {
      conditions.push("price <= ?");
      params.push(parsedMaxPrice);
    }

    let getBooksQuery = "SELECT * FROM books";
    if (conditions.length > 0) {
      getBooksQuery += " WHERE " + conditions.join(" AND ");
    }

    // Append Whitelisted Sorting
    getBooksQuery += ` ORDER BY ${allowedOrderBy[normalizedOrderBy]} ${allowedOrder[normalizedOrder]}`;

    // Append Parameterized Pagination
    getBooksQuery += " LIMIT ? OFFSET ?;";
    params.push(parsedLimit, parsedOffset);

    // Execute query using await
    const books = await db.all(getBooksQuery, params);
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({
      message: "Internal server error",
    });
  }
});

/**
 * 3. GET Single Book by ID
 * GET /books/:id
 */
app.get("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const getBookQuery = "SELECT * FROM books WHERE id = ?;";
    const book = await db.get(getBookQuery, [id]);

    if (!book) {
      return res.status(404).json({
        message: "Book not found",
      });
    }

    res.status(200).json(book);
  } catch (error) {
    res.status(500).json({
      message: "Internal server error",
    });
  }
});

/**
 * 4. POST Create a New Book
 * POST /books
 * Expected body: { "title": "...", "author": "...", "price": 500 }
 */
app.post("/books", async (req, res) => {
  try {
    const { title, author, price } = req.body;

    // Validate Title
    if (title === undefined || title === null || String(title).trim() === "") {
      return res.status(400).json({
        message: "Title is required",
      });
    }

    // Validate Author
    if (author === undefined || author === null || String(author).trim() === "") {
      return res.status(400).json({
        message: "Author is required",
      });
    }

    // Validate Price presence
    if (
      price === undefined ||
      price === null ||
      (typeof price === "string" && price.trim() === "")
    ) {
      return res.status(400).json({
        message: "Price is required",
      });
    }

    // Validate Price is numeric
    const numericPrice = Number(price);
    if (isNaN(numericPrice) || typeof price === "boolean") {
      return res.status(400).json({
        message: "Price must be a number",
      });
    }

    // Validate non-negative price
    if (numericPrice < 0) {
      return res.status(400).json({
        message: "Price must be a positive number",
      });
    }

    const insertBookQuery = `
      INSERT INTO books (title, author, price)
      VALUES (?, ?, ?);
    `;

    const result = await db.run(insertBookQuery, [
      String(title).trim(),
      String(author).trim(),
      numericPrice,
    ]);

    res.status(201).json({
      message: "Book created successfully",
      bookId: result.lastID,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal server error",
    });
  }
});

/**
 * 5. PUT Update an Existing Book
 * PUT /books/:id
 * Expected body: { "title": "...", "author": "...", "price": 450 }
 */
app.put("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Verify book exists
    const checkBookQuery = "SELECT * FROM books WHERE id = ?;";
    const existingBook = await db.get(checkBookQuery, [id]);

    if (!existingBook) {
      return res.status(404).json({
        message: "Book not found",
      });
    }

    const { title, author, price } = req.body;

    // Validate Title
    if (title === undefined || title === null || String(title).trim() === "") {
      return res.status(400).json({
        message: "Title is required",
      });
    }

    // Validate Author
    if (author === undefined || author === null || String(author).trim() === "") {
      return res.status(400).json({
        message: "Author is required",
      });
    }

    // Validate Price presence
    if (
      price === undefined ||
      price === null ||
      (typeof price === "string" && price.trim() === "")
    ) {
      return res.status(400).json({
        message: "Price is required",
      });
    }

    // Validate Price is numeric
    const numericPrice = Number(price);
    if (isNaN(numericPrice) || typeof price === "boolean") {
      return res.status(400).json({
        message: "Price must be a number",
      });
    }

    if (numericPrice < 0) {
      return res.status(400).json({
        message: "Price must be a positive number",
      });
    }

    const updateBookQuery = `
      UPDATE books
      SET title = ?, author = ?, price = ?
      WHERE id = ?;
    `;

    await db.run(updateBookQuery, [
      String(title).trim(),
      String(author).trim(),
      numericPrice,
      id,
    ]);

    res.status(200).json({
      message: "Book updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal server error",
    });
  }
});

/**
 * 6. DELETE Book by ID
 * DELETE /books/:id
 */
app.delete("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Verify book exists
    const checkBookQuery = "SELECT * FROM books WHERE id = ?;";
    const existingBook = await db.get(checkBookQuery, [id]);

    if (!existingBook) {
      return res.status(404).json({
        message: "Book not found",
      });
    }

    const deleteBookQuery = "DELETE FROM books WHERE id = ?;";
    await db.run(deleteBookQuery, [id]);

    res.status(200).json({
      message: "Book deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal server error",
    });
  }
});

/**
 * 7. Catch-all for undefined routes
 */
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

module.exports = app;

