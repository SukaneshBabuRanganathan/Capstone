const pool = require('../db/pool');

// GET /api/categories
const getCategories = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/wishlist
const getWishlist = async (req, res) => {
  try {
    const { user_id } = req.query;
    const result = await pool.query(`
      SELECT wi.id, b.id AS book_id, b.title, b.price, b.cover_color, b.format,
             a.name AS author_name
      FROM wishlist_items wi
      JOIN books b ON wi.book_id = b.id
      LEFT JOIN authors a ON b.author_id = a.id
      WHERE wi.user_id = $1
      ORDER BY wi.created_at DESC
    `, [user_id]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/wishlist
const addToWishlist = async (req, res) => {
  try {
    const { user_id, book_id } = req.body;
    await pool.query(
      'INSERT INTO wishlist_items (user_id, book_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [user_id, book_id]
    );
    res.status(201).json({ success: true, message: 'Added to wishlist' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE /api/wishlist/:id
const removeFromWishlist = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM wishlist_items WHERE id = $1', [id]);
    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getCategories, getWishlist, addToWishlist, removeFromWishlist };
