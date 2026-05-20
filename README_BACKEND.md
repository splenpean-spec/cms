# AliExpress Clone - Backend Setup

This project now includes a fully functional Node.js backend with:
- **Admin Authentication**: Secure login for administrators.
- **CRUD Operations**: Manage products (Create, Read, Update, Delete).
- **Order Management**: Automatic order recording from the checkout page.
- **Database**: SQLite (self-contained, no setup required).

## Prerequisites
- [Node.js](https://nodejs.org/) installed on your computer.

## Installation
1. Open your terminal/command prompt in this project folder.
2. Install dependencies:
   ```bash
   npm install
   ```

## Running the Server
1. Start the backend server:
   ```bash
   node server.js
   ```
2. The website will now be available at: `http://localhost:3000`

## Admin Credentials
- **Login URL**: `http://localhost:3000/admin-login.html`
- **Username**: `admin`
- **Password**: `admin123`

## Dynamic Content
- The **Home Page** now attempts to load products from the backend database.
- The **Admin Dashboard** allows you to add new products, which will immediately appear on the home page.
- Every time a user confirms a payment on the **Checkout Page**, an order is created and visible in the Admin Dashboard.
