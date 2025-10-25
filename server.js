require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());

// Test database connection
app.get('/api/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ success: true, time: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get app settings
app.get('/api/settings', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM app_settings LIMIT 1');
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update app settings
app.put('/api/settings', async (req, res) => {
    try {
        const { app_name, currency } = req.body;
        const result = await pool.query(
            'UPDATE app_settings SET app_name=$1, currency=$2, updated_at=NOW() WHERE id=1 RETURNING *',
            [app_name, currency]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all products
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add product
app.post('/api/products', async (req, res) => {
    try {
        const { name, unit, cost_price, selling_price, stock_quantity } = req.body;
        const result = await pool.query(
            'INSERT INTO products (name, unit, cost_price, selling_price, stock_quantity) VALUES ($1,$2,$3,$4,$5) RETURNING *',
            [name, unit, cost_price, selling_price, stock_quantity]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, unit, cost_price, selling_price, stock_quantity } = req.body;
        const result = await pool.query(
            'UPDATE products SET name=$1, unit=$2, cost_price=$3, selling_price=$4, stock_quantity=$5 WHERE id=$6 RETURNING *',
            [name, unit, cost_price, selling_price, stock_quantity, id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete product
app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM sales WHERE product_id=$1', [id]);
        await pool.query('DELETE FROM products WHERE id=$1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Record sale
app.post('/api/sales', async (req, res) => {
    try {
        const { product_id, quantity } = req.body;
        
        // Get product details
        const product = await pool.query('SELECT * FROM products WHERE id=$1', [product_id]);
        if (product.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        const p = product.rows[0];
        const total_amount = p.selling_price * quantity;
        const profit = (p.selling_price - p.cost_price) * quantity;
        
        // Record sale
        const sale = await pool.query(
            'INSERT INTO sales (product_id, quantity, total_amount, profit) VALUES ($1,$2,$3,$4) RETURNING *',
            [product_id, quantity, total_amount, profit]
        );
        
        // Update stock
        await pool.query(
            'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id=$2',
            [quantity, product_id]
        );
        
        res.json(sale.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get sales summary
app.get('/api/sales/summary', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.name,
                p.unit,
                COUNT(s.id) as total_sales,
                SUM(s.quantity) as total_quantity,
                SUM(s.total_amount) as total_revenue,
                SUM(s.profit) as total_profit
            FROM sales s
            JOIN products p ON s.product_id = p.id
            GROUP BY p.id, p.name, p.unit
            ORDER BY total_revenue DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get overall stats
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(DISTINCT product_id) as products_sold,
                SUM(total_amount) as total_revenue,
                SUM(profit) as total_profit,
                AVG(profit) as avg_profit_per_sale
            FROM sales
        `);
        res.json(stats.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
