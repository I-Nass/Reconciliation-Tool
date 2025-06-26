🧮 Mini Reconciliation Tool
This project provides a web-based tool designed to help finance operations teams quickly reconcile internal transaction records with external payment provider statements. It allows users to upload two CSV files, compares transactions based on a common reference, and categorizes discrepancies for easy review.

✨ Features
Dual CSV Upload: Upload your Internal System Export and Payment Provider Statement CSV files.

Transaction Comparison: Compares transactions using a configurable transaction_reference (auto-inferred, but adaptable) field.

Categorized Discrepancies: Presents reconciliation results in clear categories:

✅ Matched Transactions: Records present in both files with matching ID, amount, and status.

⚠️ Internal Only: Transactions found only in your internal system's export.

❌ Provider Only: Transactions found only in the payment provider's statement.

Intelligent Column Inference: Automatically attempts to infer common column names like transaction ID, amount, and status from your CSV headers.

Highlight Mismatched Details (Bonus): Clearly identifies transactions where the ID matches, but the amount or status differs between internal and provider records.

Export Options (Bonus):

Download individual reconciliation categories (Matched, Internal Only, Provider Only, Mismatched) as CSV files.

Download a complete reconciliation report as a JSON file.

Reconciliation History: Automatically saves past reconciliation results to local storage, allowing you to review previous reports.

User-Friendly Interface: Modern and responsive design with an intuitive upload and results display.

🚀 Technologies Used
This project is built using a combination of web technologies for the frontend and a Node.js server for the backend processing:

Frontend:

HTML5: Structure of the web application.

CSS3: Styling and responsiveness (custom CSS with Bootstrap for base styles).

JavaScript (ES6+): Client-side logic, DOM manipulation, API calls.

PapaParse: A powerful in-browser CSV parser.

Backend:

Node.js: JavaScript runtime environment.

Express.js: Fast, unopinionated, minimalist web framework for Node.js.

body-parser: Node.js middleware for parsing incoming request bodies.

cors: Node.js middleware to enable Cross-Origin Resource Sharing.

🖥️ Setup and Local Installation
To run this project locally, follow these steps:

1. Prerequisites
Node.js (LTS version recommended)

npm (comes with Node.js) or Yarn

2. Project Structure
Your project should be structured like this:

reconciliation-tool/
├── public/
│   ├── index.html         (Your frontend file with embedded CSS and JS)
│   └── (optional: css/style.css, js/script.js if separated)
└── server.js              (Your Node.js backend server)
└── package.json           (For Node.js dependencies)
└── (other project files)

Note: In the provided code, style.css and script.js content are embedded directly into index.html for simplicity in this environment.

3. Backend Setup
Navigate to your project root:

cd path/to/your/reconciliation-tool

Initialize Node.js project (if not already done):

npm init -y

Install backend dependencies:

npm install express body-parser cors

Run the backend server:

node server.js

You should see a message like: ✅ Server running at http://localhost:3000

4. Frontend Setup
Open the index.html file:
Simply open the index.html file in your web browser (e.g., file:///path/to/your/reconciliation-tool/public/index.html).

Important: The frontend is configured to communicate with the backend at http://localhost:3000. Ensure your backend server is running before attempting to reconcile files.

🚀 Usage
Open the Tool: Open index.html in your browser. A welcome modal will appear; click "Get Started" to dismiss it.

Upload Files:

Click the "Click to select Internal CSV" area in the "Upload Internal CSV" card. Select your internal transaction CSV file.

Click the "Click to select Provider CSV" area in the "Upload Provider CSV" card. Select your payment provider CSV file.

The selected file names will appear below the upload areas.

Reconcile: Click the "🔍 Reconcile" button.

View Results:

A summary dashboard will appear at the top, showing counts and percentages for matched, internal-only, provider-only, and mismatched transactions.

Below the summary, detailed lists for each category will be displayed, with mismatched items clearly highlighted.

Inferred columns used for reconciliation will also be displayed for transparency.

Export Data:

Use the "📋 Copy" button to copy the JSON data for a specific category to your clipboard.

Use the "⬇️ Download" button to download the data for a specific category as a CSV file.

Use the "⬇️ Download Full Report (JSON)" button at the top to download the complete reconciliation output as a JSON file.

View History: Click the "📜 View History" button in the navigation bar to see a list of your past reconciliation reports. You can view, download, or delete previous entries from here.

Clear Current Session: Click the "🧹 Clear All" button to clear the uploaded files and current reconciliation results from the display. Your history will remain intact.

🌐 Deployment
To deploy this project to a live environment (e.g., Replit, Render, Heroku, DigitalOcean App Platform):

Backend Deployment: Deploy your server.js file to a Node.js-compatible hosting platform (e.g., Render as a "Web Service", Heroku as an "app", DigitalOcean App Platform as a "Web Service"). This will give you a public URL for your backend (e.g., https://your-backend-app.render.com).

Frontend Deployment: Deploy your index.html (containing the embedded CSS and JS) as a static site. This can often be done on the same platform as your backend (e.g., Render as a "Static Site") or a dedicated static site host (e.g., Netlify, Vercel).

Update Frontend URL: Crucially, you must update the fetch request in your script.js (which is currently embedded in index.html). Change http://localhost:3000/reconcile to the public URL of your deployed backend (e.g., https://your-backend-app.render.com/reconcile).

// In script.js (embedded in index.html)
const response = await fetch('https://your-deployed-backend-url.com/reconcile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ internal: transformedInternalData, provider: transformedProviderData })
});

Once this change is made and the frontend is re-deployed, your live application will be fully functional.

📄 Product Requirements, Assumptions, and Scope
This project was developed with the following considerations:

Core Functionality: The primary goal is to provide a quick and easy way to compare two CSV files based on a common transaction ID and highlight discrepancies in amount and status.

Input Format: Assumes CSV files are well-formed and contain header rows. The tool attempts to infer common column names (transaction_reference, amount, status).

Reconciliation Logic: The reconciliation logic resides in the backend to allow for potential future scalability or more complex logic without impacting client-side performance.

Data Types: Transaction IDs are treated as strings. Amounts are parsed as floats. Statuses are treated as strings.

Error Handling: Basic client-side validation for file selection and backend error messages are displayed.

Scope: This is a "mini" tool focusing on the core reconciliation problem. Advanced features like user authentication, database persistence (beyond local storage), extensive data cleaning/validation, or highly customizable reconciliation rules are out of scope for this version.

Local Storage for History: Reconciliation history is stored in the browser's local storage, meaning it's tied to the specific browser and user device. It is not synced across devices or users.