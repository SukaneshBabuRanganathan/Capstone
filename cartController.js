const pool = require('../db/pool');

// GET /api/cart - Get user's cart
const getCart = async (req, res) => {
  try {
    const { user_id } = req.query;
    const result = await pool.query(`
      SELECT ci.id, ci.quantity, b.id AS book_id, b.title, b.price, b.cover_color, b.cover_text_color, b.format, b.tentative_delivery,
             a.name AS author_name,
             ARRAY_AGG(DISTINCT bt.tag) FILTER (WHERE bt.tag IS NOT NULL) AS tags
      FROM cart_items ci
      JOIN books b ON ci.book_id = b.id
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN book_tags bt ON bt.book_id = b.id
      WHERE ci.user_id = $1
      GROUP BY ci.id, ci.quantity, b.id, b.title, b.price, b.cover_color, b.cover_text_color, b.format, b.tentative_delivery, a.name
    `, [user_id]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/cart - Add to cart
const addToCart = async (req, res) => {
  try {
    const { user_id, book_id, quantity = 1 } = req.body;
    const result = await pool.query(`
      INSERT INTO cart_items (user_id, book_id, quantity)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, book_id) DO UPDATE SET quantity = cart_items.quantity + $3
      RETURNING *
    `, [user_id, book_id, quantity]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// PUT /api/cart/:id - Update cart item quantity
const updateCartItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    if (quantity <= 0) {
      await pool.query('DELETE FROM cart_items WHERE id = $1', [id]);
      return res.json({ success: true, message: 'Item removed' });
    }
    const result = await pool.query(
      'UPDATE cart_items SET quantity = $1 WHERE id = $2 RETURNING *',
      [quantity, id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE /api/cart/:id - Remove from cart
const removeFromCart = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM cart_items WHERE id = $1', [id]);
    res.json({ success: true, message: 'Item removed from cart' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE /api/cart/clear - Clear cart
const clearCart = async (req, res) => {
  try {
    const { user_id } = req.body;
    await pool.query('DELETE FROM cart_items WHERE user_id = $1', [user_id]);
    res.json({ success: true, message: 'Cart cleared' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getCart, addToCart, updateCartItem, removeFromCart, clearCart };
