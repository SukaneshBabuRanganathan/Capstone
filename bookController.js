const pool = require('../db/pool');

// GET /api/books - Get all books with filtering
const getBooks = async (req, res) => {
  try {
    const { category, search, format, language, min_price, max_price, sort, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT b.*, a.name AS author_name, c.name AS category_name, c.slug AS category_slug,
             ARRAY_AGG(DISTINCT bt.tag) FILTER (WHERE bt.tag IS NOT NULL) AS tags
      FROM books b
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN book_tags bt ON bt.book_id = b.id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (category && category !== 'all') {
      query += ` AND c.slug = $${paramIdx++}`;
      params.push(category);
    }
    if (search) {
      query += ` AND (LOWER(b.title) LIKE $${paramIdx} OR LOWER(a.name) LIKE $${paramIdx})`;
      params.push(`%${search.toLowerCase()}%`);
      paramIdx++;
    }
    if (format) {
      query += ` AND LOWER(b.format) = $${paramIdx++}`;
      params.push(format.toLowerCase());
    }
    if (language) {
      query += ` AND LOWER(b.language) = $${paramIdx++}`;
      params.push(language.toLowerCase());
    }
    if (min_price) {
      query += ` AND b.price >= $${paramIdx++}`;
      params.push(parseFloat(min_price));
    }
    if (max_price) {
      query += ` AND b.price <= $${paramIdx++}`;
      params.push(parseFloat(max_price));
    }

    query += ' GROUP BY b.id, a.name, c.name, c.slug';

    switch (sort) {
      case 'price_asc': query += ' ORDER BY b.price ASC'; break;
      case 'price_desc': query += ' ORDER BY b.price DESC'; break;
      case 'rating': query += ' ORDER BY b.rating DESC'; break;
      case 'newest': query += ' ORDER BY b.created_at DESC'; break;
      default: query += ' ORDER BY b.is_featured DESC, b.sells DESC';
    }

    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/books/featured - Get featured/recommended books
const getFeaturedBooks = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.*, a.name AS author_name, c.name AS category_name,
             ARRAY_AGG(DISTINCT bt.tag) FILTER (WHERE bt.tag IS NOT NULL) AS tags
      FROM books b
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN book_tags bt ON bt.book_id = b.id
      WHERE b.is_featured = true
      GROUP BY b.id, a.name, c.name
      ORDER BY b.sells DESC
      LIMIT 6
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/books/bestsellers
const getBestsellers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.*, a.name AS author_name, c.name AS category_name,
             ARRAY_AGG(DISTINCT bt.tag) FILTER (WHERE bt.tag IS NOT NULL) AS tags
      FROM books b
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN book_tags bt ON bt.book_id = b.id
      WHERE b.is_bestseller = true
      GROUP BY b.id, a.name, c.name
      ORDER BY b.sells DESC
      LIMIT 6
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/books/new-launches
const getNewLaunches = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.*, a.name AS author_name, c.name AS category_name,
             ARRAY_AGG(DISTINCT bt.tag) FILTER (WHERE bt.tag IS NOT NULL) AS tags
      FROM books b
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN book_tags bt ON bt.book_id = b.id
      WHERE b.is_new_launch = true
      GROUP BY b.id, a.name, c.name
      ORDER BY b.created_at DESC
      LIMIT 6
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/books/:id - Get single book with details
const getBookById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT b.*, a.name AS author_name, a.bio AS author_bio, a.avatar_url AS author_avatar,
             c.name AS category_name, c.slug AS category_slug,
             ARRAY_AGG(DISTINCT bt.tag) FILTER (WHERE bt.tag IS NOT NULL) AS tags
      FROM books b
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN book_tags bt ON bt.book_id = b.id
      WHERE b.id = $1
      GROUP BY b.id, a.name, a.bio, a.avatar_url, c.name, c.slug
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    // Get reviews
    const reviews = await pool.query(`
      SELECT r.*, u.name AS user_name
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.book_id = $1
      ORDER BY r.created_at DESC
    `, [id]);

    // Get related books (same category)
    const related = await pool.query(`
      SELECT b.*, a.name AS author_name,
             ARRAY_AGG(DISTINCT bt.tag) FILTER (WHERE bt.tag IS NOT NULL) AS tags
      FROM books b
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN book_tags bt ON bt.book_id = b.id
      WHERE b.category_id = $1 AND b.id != $2
      GROUP BY b.id, a.name
      ORDER BY b.rating DESC
      LIMIT 4
    `, [result.rows[0].category_id, id]);

    res.json({
      success: true,
      data: result.rows[0],
      reviews: reviews.rows,
      related: related.rows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/books/:id/reviews - Add review
const addReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, rating, review_text } = req.body;
    const result = await pool.query(
      `INSERT INTO reviews (book_id, user_id, rating, review_text) VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, user_id, rating, review_text]
    );
    // Update book average rating
    await pool.query(`
      UPDATE books SET rating = (
        SELECT AVG(rating) FROM reviews WHERE book_id = $1
      ), total_ratings = (
        SELECT COUNT(*) FROM reviews WHERE book_id = $1
      ) WHERE id = $1
    `, [id]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getBooks, getFeaturedBooks, getBestsellers, getNewLaunches, getBookById, addReview };
