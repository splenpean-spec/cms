require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'aliexpress_clone_fallback_secret_2026';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '/')));

// Database setup (SQLite)
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite',
    logging: false
});

// Models
const User = sequelize.define('User', {
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    password: { type: DataTypes.STRING, allowNull: false }
});

const Product = sequelize.define('Product', {
    name: { type: DataTypes.STRING, allowNull: false },
    price: { type: DataTypes.FLOAT, allowNull: false },
    image: { type: DataTypes.STRING },
    category: { type: DataTypes.STRING },
    description: { type: DataTypes.TEXT },
    quantity: { type: DataTypes.INTEGER, defaultValue: 0 },
    soldCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    colors: { type: DataTypes.STRING } // Comma-separated colors
});

const Order = sequelize.define('Order', {
    customerName: { type: DataTypes.STRING },
    totalAmount: { type: DataTypes.FLOAT },
    paymentMethod: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING, defaultValue: 'Pending' },
    items: { type: DataTypes.TEXT } // Simplified: JSON string of items
});

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Routes - Auth
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    console.log(`Login attempt for username: ${username}`);
    try {
        const user = await User.findOne({ where: { username } });
        if (!user) {
            console.log('User not found');
            return res.status(404).json({ message: 'User not found' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            console.log('Invalid password');
            return res.status(401).json({ message: 'Invalid password' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        console.log('Login successful, token generated');
        res.json({ token });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) return res.status(401).json({ message: 'Current password incorrect' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Routes - Products (Public Read)
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.findAll();
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findByPk(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Routes - Products (Admin CRUD)
app.post('/api/products', authenticateToken, async (req, res) => {
    try {
        const product = await Product.create(req.body);
        res.status(201).json(product);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.put('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        const product = await Product.findByPk(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        await product.update(req.body);
        res.json(product);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        const product = await Product.findByPk(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        await product.destroy();
        res.json({ message: 'Product deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Routes - Orders
app.post('/api/orders', async (req, res) => {
    try {
        const order = await Order.create(req.body);
        res.status(201).json(order);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        const orders = await Order.findAll();
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Database Sync and Server Start
console.log('Starting database sync...');
sequelize.sync({ alter: true })
    .then(async () => {
        console.log('Database synced successfully');
        
        try {
            // Create default admin if not exists
            const adminExists = await User.findOne({ where: { username: 'admin' } });
            if (!adminExists) {
                const hashedPassword = await bcrypt.hash('admin123', 10);
                await User.create({ username: 'admin', password: hashedPassword });
                console.log('Default admin created: admin / admin123');
            }

            // Seed initial products if database is empty
            const productCount = await Product.count();
            if (productCount === 0) {
                const initialProducts = [
                    // Appliances
                    {
                        name: "Portable Mini Refrigerator 4L Car Fridge Cooler Warmer",
                        price: 35.99,
                        image: "https://ae01.alicdn.com/kf/S8407883d648b4b79b5b64b1f6e804a60Y.jpg",
                        category: "appliances",
                        description: "Compact 4-liter mini fridge, perfect for cars, offices, and dorms. Features both cooling and warming functions. Eco-friendly and quiet operation.",
                        quantity: 150,
                        colors: "White, Pink, Blue"
                    },
                    {
                        name: "Xiaomi Mijia Robot Vacuum Mop 3C Enhanced Edition",
                        price: 189.50,
                        image: "https://ae01.alicdn.com/kf/S7e19395f87744383a8f5984407987e38N.jpg",
                        category: "appliances",
                        description: "LDS Laser Navigation, 5000Pa Suction Power, Smart App Control. Efficiently cleans every corner of your home.",
                        quantity: 45,
                        colors: "White"
                    },
                    // Automotive
                    {
                        name: "Universal Car Seat Cover Set Breathable Leather",
                        price: 45.20,
                        image: "https://ae01.alicdn.com/kf/S0c86311654e549118086a44f45447a16E.jpg",
                        category: "automotive",
                        description: "High-quality PU leather seat covers, waterproof and easy to clean. Fits most sedan and SUV models.",
                        quantity: 80,
                        colors: "Black, Beige, Red"
                    },
                    {
                        name: "12V 150PSI Portable Car Air Compressor Tire Inflator",
                        price: 28.15,
                        image: "https://ae01.alicdn.com/kf/S8f9037f0048e4b779e56475f6e804a604.jpg",
                        category: "automotive",
                        description: "Digital display tire inflator with auto-shutoff. Includes LED light for emergency use.",
                        quantity: 200,
                        colors: "Black"
                    },
                    // Clothing
                    {
                        name: "Men's Lightweight Waterproof Windbreaker Jacket",
                        price: 19.99,
                        image: "https://ae01.alicdn.com/kf/S2c89f7f4585c4909a39f5062a45447a16E.jpg",
                        category: "clothing",
                        description: "Outdoor sports jacket for hiking, camping, and daily wear. Breathable and quick-dry material.",
                        quantity: 300,
                        colors: "Navy Blue, Green, Gray"
                    },
                    {
                        name: "Women's High Waist Seamless Yoga Pants Leggings",
                        price: 12.45,
                        image: "https://ae01.alicdn.com/kf/S7f0c184c8f584e038084a44f45447a16E.jpg",
                        category: "clothing",
                        description: "Stretchy and squat-proof fitness leggings. Perfect for gym, yoga, and casual wear.",
                        quantity: 500,
                        colors: "Purple, Black, Pink, Blue"
                    },
                    // Electronics (Deals)
                    {
                        name: "TWS Wireless Bluetooth Earbuds with Charging Case",
                        price: 9.90,
                        image: "https://ae01.alicdn.com/kf/S9387a956163342378a5994f981e494d93.jpg",
                        category: "deals",
                        description: "HiFi Stereo Sound, Bluetooth 5.3, Long Battery Life. Compatible with iOS and Android.",
                        quantity: 1000,
                        colors: "Black, White"
                    },
                    {
                        name: "Smart Watch Ultra Series 8 NFC GPS Tracker",
                        price: 24.80,
                        image: "https://ae01.alicdn.com/kf/S4c89f7f4585c4909a39f5062a45447a16E.jpg",
                        category: "deals",
                        description: "Fitness tracker with heart rate monitor, sleep tracking, and Bluetooth calling. IP68 waterproof.",
                        quantity: 150,
                        colors: "Orange, Black, Gray"
                    }
                ];
                await Product.bulkCreate(initialProducts);
                console.log('Initial products seeded successfully');
            }
        } catch (adminError) {
            console.error('Error checking/creating admin user:', adminError);
        }

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error('Failed to sync database:', err);
        // Still start the server so we can at least see static pages and errors
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server started with DB error on port ${PORT}`);
        });
    });
