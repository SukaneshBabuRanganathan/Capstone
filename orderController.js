const pool = require('../db/pool');

// POST /api/orders - Create order
const createOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      user_id, items, subtotal, tax, delivery_charges = 0, discount = 0,
      total_amount, coupon_code, gift_points_used = 0, address, payment_method
    } = req.body;

    // Save address
    let addressId = null;
    if (address) {
      const addrResult = await client.query(`
        INSERT INTO addresses (user_id, first_name, last_name, address_line1, address_line2, city, state, pin, country, phone)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
      `, [user_id, address.first_name, address.last_name, address.address_line1, address.address_line2 || '',
          address.city, address.state, address.pin, address.country || 'India', address.phone]);
      addressId = addrResult.rows[0].id;
    }

    // Create order
    const orderResult = await client.query(`
      INSERT INTO orders (user_id, subtotal, tax, delivery_charges, discount, total_amount, coupon_code, gift_points_used, address_id, payment_method, status, payment_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'confirmed', 'paid') RETURNING *
    `, [user_id, subtotal, tax, delivery_charges, discount, total_amount, coupon_code, gift_points_used, addressId, payment_method]);

    const orderId = orderResult.rows[0].id;

    // Insert order items
    for (const item of items) {
      await client.query(`
        INSERT INTO order_items (order_id, book_id, quantity, unit_price, total_price)
        VALUES ($1, $2, $3, $4, $5)
      `, [orderId, item.book_id, item.quantity, item.unit_price, item.total_price]);

      // Update book sells count
      await client.query('UPDATE books SET sells = sells + $1 WHERE id = $2', [item.quantity, item.book_id]);
    }

    // Deduct gift points if used
    if (gift_points_used > 0) {
      await client.query('UPDATE users SET gift_points = gift_points - $1 WHERE id = $2', [gift_points_used, user_id]);
    }

    // Add gift points (1 point per ₹10 spent)
    const pointsEarned = Math.floor(total_amount / 10);
    await client.query('UPDATE users SET gift_points = gift_points + $1 WHERE id = $2', [pointsEarned, user_id]);

    // Clear cart
    await client.query('DELETE FROM cart_items WHERE user_id = $1', [user_id]);

    await client.query('COMMIT');

    // Return full order with items
    const fullOrder = await pool.query(`
      SELECT o.*, oi.book_id, oi.quantity, oi.unit_price, oi.total_price,
             b.title, b.cover_color, b.format, a.name AS author_name,
             ARRAY_AGG(DISTINCT bt.tag) FILTER (WHERE bt.tag IS NOT NULL) AS tags
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN books b ON oi.book_id = b.id
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN book_tags bt ON bt.book_id = b.id
      WHERE o.id = $1
      GROUP BY o.id, oi.book_id, oi.quantity, oi.unit_price, oi.total_price, b.title, b.cover_color, b.format, a.name
    `, [orderId]);

    res.status(201).json({ success: true, order_id: orderId, items: fullOrder.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

// GET /api/orders - Get user orders
const getOrders = async (req, res) => {
  try {
    const { user_id } = req.query;
    const result = await pool.query(`
      SELECT o.id, o.status, o.total_amount, o.created_at, o.payment_method, o.payment_status,
             JSON_AGG(JSON_BUILD_OBJECT(
               'book_id', oi.book_id, 'title', b.title, 'author', a.name,
               'quantity', oi.quantity, 'unit_price', oi.unit_price,
               'cover_color', b.cover_color
             )) AS items
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN books b ON oi.book_id = b.id
      LEFT JOIN authors a ON b.author_id = a.id
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `, [user_id]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/orders/validate-coupon
const validateCoupon = async (req, res) => {
  try {
    const { code, order_amount } = req.body;
    const result = await pool.query(
      `SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())`,
      [code]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ success: false, error: 'Invalid or expired coupon' });

    const coupon = result.rows[0];
    if (order_amount < coupon.min_order_amount)
      return res.status(400).json({ success: false, error: `Minimum order amount is ₹${coupon.min_order_amount}` });

    const discount = coupon.discount_type === 'percent'
      ? Math.floor(order_amount * coupon.discount_value / 100)
      : coupon.discount_value;

    res.json({ success: true, discount, coupon_code: coupon.code, discount_type: coupon.discount_type });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { createOrder, getOrders, validateCoupon };
