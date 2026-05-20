require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'aliexpress_clone_fallback_secret_2026';

// Create uploads directory if not exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '/')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
    image: { type: DataTypes.STRING }, // Main image
    images: { type: DataTypes.TEXT }, // JSON string for multiple images
    category: { type: DataTypes.STRING },
    description: { type: DataTypes.TEXT },
    quantity: { type: DataTypes.INTEGER, defaultValue: 0 },
    shippingFee: { type: DataTypes.FLOAT, defaultValue: 0 },
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
app.post('/api/products', authenticateToken, upload.array('productImages', 10), async (req, res) => {
    console.log('--- POST /api/products ---');
    console.log('Files received:', req.files ? req.files.length : 0);
    try {
        const { price, quantity, soldCount, shippingFee } = req.body;
        const uploadedFiles = req.files || [];
        const imagePaths = uploadedFiles.map(f => `/uploads/${f.filename}`);
        
        const productData = {
            ...req.body,
            price: price ? parseFloat(price) : 0,
            quantity: quantity ? parseInt(quantity) : 0,
            shippingFee: shippingFee ? parseFloat(shippingFee) : 0,
            soldCount: soldCount ? parseInt(soldCount) : 0,
            image: imagePaths.length > 0 ? imagePaths[0] : (req.body.image || ''),
            images: JSON.stringify(imagePaths.length > 0 ? imagePaths : (req.body.images ? (typeof req.body.images === 'string' ? JSON.parse(req.body.images) : req.body.images) : []))
        };
        const product = await Product.create(productData);
        console.log('Product created successfully:', product.id);
        res.status(201).json(product);
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(400).json({ message: error.message });
    }
});

app.put('/api/products/:id', authenticateToken, upload.array('productImages', 10), async (req, res) => {
    console.log(`--- PUT /api/products/${req.params.id} ---`);
    console.log('Files received:', req.files ? req.files.length : 0);
    try {
        const product = await Product.findByPk(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        
        const { price, quantity, soldCount, shippingFee } = req.body;
        const uploadedFiles = req.files || [];
        const imagePaths = uploadedFiles.map(f => `/uploads/${f.filename}`);
        
        const updateData = {
            ...req.body,
            price: price ? parseFloat(price) : product.price,
            quantity: quantity ? parseInt(quantity) : product.quantity,
            shippingFee: shippingFee ? parseFloat(shippingFee) : product.shippingFee,
            soldCount: soldCount ? parseInt(soldCount) : product.soldCount,
            image: imagePaths.length > 0 ? imagePaths[0] : product.image,
            images: imagePaths.length > 0 ? JSON.stringify(imagePaths) : product.images
        };
        
        await product.update(updateData);
        console.log('Product updated successfully');
        res.json(product);
    } catch (error) {
        console.error('Error updating product:', error);
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
                    // Women's Fashion
                    {
                        name: "Women's Elegant Summer Floral Print Dress",
                        price: 24.99,
                        image: "https://ae01.alicdn.com/kf/S7f0c184c8f584e038084a44f45447a16E.jpg",
                        images: JSON.stringify([
                            "https://ae01.alicdn.com/kf/S7f0c184c8f584e038084a44f45447a16E.jpg",
                            "https://ae01.alicdn.com/kf/S2c89f7f4585c4909a39f5062a45447a16E.jpg",
                            "https://ae01.alicdn.com/kf/S8f9037f0048e4b779e56475f6e804a604.jpg"
                        ]),
                        category: "Women's Fashion",
                        description: "Beautiful floral print dress perfect for summer outings. Breathable fabric and elegant design.",
                        quantity: 100,
                        colors: "Blue, Pink, Yellow",
                        shippingFee: 0
                    },
                    // Men's Fashion
                    {
                        name: "Men's Casual Slim Fit Cotton Polo Shirt",
                        price: 18.50,
                        image: "https://ae01.alicdn.com/kf/S2c89f7f4585c4909a39f5062a45447a16E.jpg",
                        images: JSON.stringify([
                            "https://ae01.alicdn.com/kf/S2c89f7f4585c4909a39f5062a45447a16E.jpg",
                            "https://ae01.alicdn.com/kf/S7f0c184c8f584e038084a44f45447a16E.jpg"
                        ]),
                        category: "Men's Fashion",
                        description: "High-quality cotton polo shirt for a smart-casual look. Available in multiple colors.",
                        quantity: 150,
                        colors: "Black, White, Navy",
                        shippingFee: 2.50
                    },
                    // Phones & Telecommunications
                    {
                        name: "Global Version Smartphone 5G 12GB+256GB",
                        price: 299.00,
                        image: "https://ae01.alicdn.com/kf/S8f9037f0048e4b779e56475f6e804a604.jpg",
                        images: JSON.stringify([
                            "https://ae01.alicdn.com/kf/S8f9037f0048e4b779e56475f6e804a604.jpg",
                            "https://ae01.alicdn.com/kf/S9387a956163342378a5994f981e494d93.jpg"
                        ]),
                        category: "Phones & Telecommunications",
                        description: "Powerful 5G smartphone with high-resolution camera and long-lasting battery.",
                        quantity: 50,
                        colors: "Black, Silver",
                        shippingFee: 0
                    },
                    // Computer & Office
                    {
                        name: "Wireless Mechanical Gaming Keyboard RGB",
                        price: 45.00,
                        image: "https://ae01.alicdn.com/kf/S9387a956163342378a5994f981e494d93.jpg",
                        category: "Computer & Office",
                        description: "Tactile mechanical switches with customizable RGB lighting. Perfect for gaming and office work.",
                        quantity: 80,
                        colors: "Black, White",
                        shippingFee: 5.00
                    },
                    // Consumer Electronics
                    {
                        name: "Noise Cancelling Bluetooth Headphones Over-Ear",
                        price: 89.99,
                        image: "https://ae01.alicdn.com/kf/S553e11559863412cb928784992524a87M.jpg",
                        category: "Consumer Electronics",
                        description: "Immersive sound quality with active noise cancellation. 40-hour battery life.",
                        quantity: 60,
                        colors: "Black, Gray",
                        shippingFee: 0
                    },
                    // Home & Appliances
                    {
                        name: "Portable Mini Refrigerator 4L Car Fridge",
                        price: 35.99,
                        image: "https://ae01.alicdn.com/kf/S8407883d648b4b79b5b64b1f6e804a60Y.jpg",
                        category: "Home, Pet & Appliances",
                        description: "Compact 4-liter mini fridge, perfect for cars and offices.",
                        quantity: 150,
                        colors: "White, Pink",
                        shippingFee: 10.00
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
