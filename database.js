/**
 * Lab 3: Database Connection Module
 * Student: YANAMALA SREEDHAR
 * Course: Backend Development Fundamentals
 */

const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

// Path to SQLite database file
const dbPath = path.join(__dirname, "goodreads.db");

/**
 * Initializes and returns the SQLite database connection.
 * Ensures the 'books' table exists.
 */
const initializeDB = async () => {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // Ensure table exists
  await db.run(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      price INTEGER NOT NULL
    );
  `);

  return db;
};

module.exports = {
  initializeDB,
  dbPath,
};
