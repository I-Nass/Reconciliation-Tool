// Global variable to hold the last reconciliation result for sharing
let lastReconciliationResult = null;

// Global function to display messages
function showMessage(message, duration = 3000) {
    const msgBox = document.getElementById("messageBox");
    msgBox.textContent = message;
    msgBox.classList.add("show");
    setTimeout(() => {
        msgBox.classList.remove("show");
    }, duration);
}

// MODAL LOGIC
function closeModal() {
    const modal = document.getElementById("introModal");
    if (modal) {
        modal.classList.remove("show"); // Use class for animation
        setTimeout(() => {
            modal.style.display = "none"; // Hide after animation
        }, 300); // Match CSS transition duration
        sessionStorage.setItem("modalDismissed", "true");
    }
}

// CSV PARSER
function parseCSV(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data),
            error: (err) => reject(err),
        });
    });
}

/**
 * Infers common field names (ID, Amount, Status) from CSV headers,
 * prioritizing names expected by the backend.
 * Returns an object mapping general names to actual header names.
 * @param {Array<Object>} data - The parsed CSV data.
 * @returns {Object} An object with inferred field names or null if not found.
 */
function inferFields(data) {
    if (!data || data.length === 0)
        return { id: null, amount: null, status: null };

    const headers = Object.keys(data[0]);
    const inferred = { id: null, amount: null, status: null };

    // Create a map for quick lookup of cleaned headers to original headers
    const cleanedToOriginalMap = new Map();
    headers.forEach((h) => {
        cleanedToOriginalMap.set(
            String(h)
                .toLowerCase()
                .replace(/[^a-z0-9]/g, ""),
            h,
        );
    });

    const findOriginalHeader = (keywords) => {
        for (const keyword of keywords) {
            // Clean the keyword before checking against the map
            const cleanedKeyword = String(keyword)
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "");
            const originalHeader = cleanedToOriginalMap.get(cleanedKeyword);
            if (originalHeader) {
                return originalHeader;
            }
        }
        return null;
    };

    // Prioritize backend's exact expected names and common alternatives
    inferred.id = findOriginalHeader([
        "transaction_reference",
        "transactionreference",
        "transid",
        "id",
        "orderid",
        "paymentid",
        "reference",
        "ref",
    ]);
    inferred.amount = findOriginalHeader([
        "amount",
        "value",
        "total",
        "transactionamount",
        "txamount",
    ]);
    // FIX: Ensure keywords are cleaned inside findOriginalHeader
    inferred.status = findOriginalHeader([
        "status",
        "transactionstatus",
        "txstatus",
        "state",
        "payment_status",
    ]);

    // Fallback for ID if still null, use the first header
    if (!inferred.id && headers.length > 0) {
        inferred.id = headers[0];
    }

    return inferred;
}

/**
 * Transforms the input data by renaming inferred columns to backend-expected keys.
 * @param {Array<Object>} data - The original parsed CSV data.
 * @param {Object} inferredFields - The object containing inferred column names.
 * @returns {Array<Object>} The transformed data with keys matching backend expectations.
 */
function transformDataForBackend(data, inferredFields) {
    return data.map((row) => {
        const newRow = {};
        // Map inferred 'id' to 'transaction_reference' for backend
        if (inferredFields.id && row[inferredFields.id] !== undefined) {
            newRow.transaction_reference = String(
                row[inferredFields.id],
            ).trim();
        } else {
            // If ID field not found, still include transaction_reference as empty string
            newRow.transaction_reference = "";
        }

        // Map inferred 'amount' to 'amount' for backend
        if (inferredFields.amount && row[inferredFields.amount] !== undefined) {
            newRow.amount = parseFloat(
                String(row[inferredFields.amount]).trim() || 0,
            );
        } else {
            newRow.amount = 0; // Default to 0 if amount not found/invalid
        }

        // Map inferred 'status' to 'status' for backend
        if (inferredFields.status && row[inferredFields.status] !== undefined) {
            newRow.status = String(row[inferredFields.status]).trim();
        } else {
            newRow.status = ""; // Default to empty string if status not found
        }

        // Copy other fields as well to retain full context in results (if backend doesn't filter)
        Object.keys(row).forEach((key) => {
            // Avoid overwriting if it's one of our mapped keys that have already been set (e.g., transaction_reference, amount, status)
            // We check against the *original* inferred field names to ensure we don't duplicate or overwrite a mapped key.
            if (
                key !== inferredFields.id &&
                key !== inferredFields.amount &&
                key !== inferredFields.status
            ) {
                newRow[key] = row[key];
            }
        });
        return newRow;
    });
}

// MAIN PROCESS FUNCTION
async function processFiles() {
    const internalFile = document.getElementById("internalFile").files[0];
    const providerFile = document.getElementById("providerFile").files[0];

    if (!internalFile || !providerFile) {
        showMessage(
            "Please select both Internal and Provider CSV files.",
            3000,
        );
        return;
    }

    try {
        // Parse both files
        const internalData = await parseCSV(internalFile);
        // FIX: Removed duplicate 'await'
        const providerData = await parseCSV(providerFile);

        // Render mini previews immediately
        renderMiniPreviews(internalData, providerData);

        // Infer columns from the client's perspective to display to the user
        const internalClientFields = inferFields(internalData);
        const providerClientFields = inferFields(providerData);

        // If critical ID fields are not found for client-side inference, inform user and return
        if (!internalClientFields.id || !providerClientFields.id) {
            displayColumnInfo({
                internal: internalClientFields,
                provider: providerClientFields,
            });
            // Clear previous results to avoid confusion if an error occurs
            document.getElementById("results").innerHTML = "";
            return;
        }

        // Transform data to match backend's expected keys ('transaction_reference', 'amount', 'status')
        const transformedInternalData = transformDataForBackend(
            internalData,
            internalClientFields,
        );
        const transformedProviderData = transformDataForBackend(
            providerData,
            providerClientFields,
        );

        // Display inferred column information (based on client's inference)
        displayColumnInfo({
            internal: internalClientFields,
            provider: providerClientFields,
        });

        // Send transformed data to backend for reconciliation
        const response = await fetch("/reconcile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                internal: transformedInternalData,
                provider: transformedProviderData,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
                `Server error: ${errorData.error || response.statusText}`,
            );
        }

        const result = await response.json();
        console.log("Received data from backend:", result);

        // Attach the client's inferred columns to the result for history and re-display
        result.inferredColumns = {
            internal: internalClientFields,
            provider: providerClientFields,
        };

        // Store the full result globally for the "Download Full Report" button
        lastReconciliationResult = result;

        displayResults(result);

        // Save history
        saveHistory({
            internalFileName: internalFile.name,
            providerFileName: providerFile.name,
            internalData, // Save original data for preview/debug from history
            providerData, // Save original data for preview/debug from history
            result,
        });
        showMessage("Reconciliation complete!", 3000);
    } catch (err) {
        console.error("Error during file processing or reconciliation:", err);
        showMessage(
            `An error occurred: ${err.message}. Please ensure your CSVs are correctly formatted and the backend server is running on http://localhost:3000.`,
            7000,
        );
    }
}

// Display inferred column information
function displayColumnInfo(inferred) {
    const columnInfoSection = document.getElementById("columnInfo");
    if (!columnInfoSection) return;

    let htmlContent = `<h4>Inferred Columns Used for Reconciliation:</h4>`;
    htmlContent += `
        <p><strong>Internal File:</strong><br>
        ID: "${inferred.internal.id || "Not found"}", 
        Amount: "${inferred.internal.amount || "Not found"}", 
        Status: "${inferred.internal.status || "Not found"}"</p>
        <p><strong>Provider File:</strong><br>
        ID: "${inferred.provider.id || "Not found"}", 
        Amount: "${inferred.provider.amount || "Not found"}", 
        Status: "${inferred.provider.status || "Not found"}"</p>
        <p><em>Ensure these columns are correct. If not, please adjust your CSV headers.</em></p>
    `;
    columnInfoSection.innerHTML = htmlContent;
    columnInfoSection.style.display = "block";
}

// DISPLAY RESULTS LOGIC
function displayResults(data) {
    const {
        matched = [],
        internalOnly = [],
        providerOnly = [],
        partialMismatches = [],
    } = data;

    const section = document.getElementById("results");
    section.innerHTML = ""; // Clear previous results

    // Calculate total records based on reconciliation results
    const totalRecords =
        matched.length +
        internalOnly.length +
        providerOnly.length +
        partialMismatches.length;

    // Render Summary Dashboard
    renderSummaryDashboard(
        matched.length,
        internalOnly.length,
        providerOnly.length,
        partialMismatches.length,
        totalRecords,
    );

    // Add the "Download Full Report" button at the top of the results section
    const downloadFullButton = document.createElement("button");
    downloadFullButton.className = "download-full-report-btn";
    downloadFullButton.textContent = "⬇️ Download Full Report (JSON)";
    downloadFullButton.onclick = downloadFullReport;
    section.appendChild(downloadFullButton);

    const groups = [
        {
            title: "✅ Matched Transactions",
            data: matched,
            colorClass: "status-green",
            key: "matched",
        },
        {
            title: "⚠️ Internal Only",
            data: internalOnly,
            colorClass: "status-yellow",
            key: "internalOnly",
        },
        {
            title: "❌ Provider Only",
            data: providerOnly,
            colorClass: "status-red",
            key: "providerOnly",
        },
        {
            title: "⚠️ Mismatched Amount/Status",
            data: partialMismatches,
            colorClass: "status-yellow",
            key: "partialMismatches",
        },
    ];

    groups.forEach((group) => {
        const wrapper = document.createElement("div");
        wrapper.className = "result-section";

        // Only render buttons if there is data
        const buttonsHtml =
            group.data.length > 0
                ? `
                <button onclick="copyToClipboard('${group.key}')">📋 Copy</button>
                <button onclick="downloadCSV('${group.key}')">⬇️ Download</button>
              `
                : `<p style="color: var(--medium-grey); font-style: italic;">No records found in this section.</p>`;

        wrapper.innerHTML = `
            <h2 class="${group.colorClass}">${group.title} (${group.data.length})</h2>
            ${buttonsHtml}
            <pre id="${group.key}">${formatJson(group.data)}</pre>
        `;
        section.appendChild(wrapper);
    });
}

// Render Summary Dashboard
function renderSummaryDashboard(
    matched,
    internalOnly,
    providerOnly,
    partialMismatches,
    totalRecords,
) {
    const resultsSection = document.getElementById("results");
    const summaryDiv = document.createElement("div");
    summaryDiv.className = "summary-dashboard";

    const calculatePercentage = (count) =>
        totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) : 0;

    summaryDiv.innerHTML = `
        <div class="summary-item status-green">
            <h4>Matched</h4>
            <span class="count">${matched}</span>
            <span class="percentage">${calculatePercentage(matched)}%</span>
        </div>
        <div class="summary-item status-yellow">
            <h4>Internal Only</h4>
            <span class="count">${internalOnly}</span>
            <span class="percentage">${calculatePercentage(internalOnly)}%</span>
        </div>
        <div class="summary-item status-red">
            <h4>Provider Only</h4>
            <span class="count">${providerOnly}</span>
            <span class="percentage">${calculatePercentage(providerOnly)}%</span>
        </div>
        <div class="summary-item status-yellow">
            <h4>Mismatched</h4>
            <span class="count">${partialMismatches}</span>
            <span class="percentage">${calculatePercentage(partialMismatches)}%</span>
        </div>
    `;
    // Insert at the beginning of the results section
    resultsSection.insertBefore(summaryDiv, resultsSection.firstChild);
}

// Function to copy content to clipboard
function copyToClipboard(id) {
    const content = document.getElementById(id).innerText;
    // Using document.execCommand('copy') for better compatibility in iframe
    const textArea = document.createElement("textarea");
    textArea.value = content;
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand("copy");
        showMessage("Copied to clipboard!");
    } catch (err) {
        console.error("Clipboard error:", err);
        showMessage("Failed to copy to clipboard.", 3000);
    } finally {
        document.body.removeChild(textArea);
    }
}

// Function to download CSV
function downloadCSV(id) {
    const content = document.getElementById(id).innerText;
    let json;
    try {
        // If content is "No records", parse it as an empty array
        json = content === "No records" ? [] : JSON.parse(content);
    } catch (err) {
        showMessage("Invalid data format. Cannot convert to CSV.", 3000);
        console.error("Download CSV error: Invalid JSON format", err);
        return;
    }

    const csv = Papa.unparse(json);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${id}_results.csv`;
    link.click();
    showMessage(`Downloading ${id}_results.csv...`, 2000);
}

/**
 * Downloads the full reconciliation result as a JSON file.
 */
function downloadFullReport() {
    if (!lastReconciliationResult) {
        showMessage(
            "No reconciliation results to download. Please run a reconciliation first.",
            3000,
        );
        return;
    }

    const jsonString = JSON.stringify(lastReconciliationResult, null, 2);
    const blob = new Blob([jsonString], {
        type: "application/json;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.-]/g, "");
    link.download = `full_reconciliation_report_${timestamp}.json`;
    link.click();
    showMessage("Downloading full report (JSON)...", 2000);
}

// MINI PREVIEW OF FILES
function renderMiniPreviews(internalData, providerData) {
    let previewSection = document.getElementById("filePreviews");
    if (!previewSection) {
        previewSection = createPreviewContainer();
    }
    previewSection.style.display = "flex"; // Ensure it's visible

    previewSection.innerHTML = `
        <div class="file-preview">
            <h3>📂 Internal File (First 5 Rows)</h3>
            <pre>${previewTable(internalData.slice(0, 5))}</pre>
        </div>
        <div class="file-preview">
            <h3>🏦 Provider File (First 5 Rows)</h3>
            <pre>${previewTable(providerData.slice(0, 5))}</pre>
        </div>
    `;
}

// Helper to create the file preview container if it doesn't exist
function createPreviewContainer() {
    const previewSection = document.createElement("section");
    previewSection.id = "filePreviews";
    previewSection.className = "file-preview-container";
    const resultsContainer = document.getElementById("results");
    // Insert before the results section
    resultsContainer.parentNode.insertBefore(previewSection, resultsContainer);
    return previewSection;
}

// Helper to format data for the preview table
function previewTable(data) {
    if (!data || data.length === 0) return "No data to preview.";

    // Get all unique headers from the first few rows for robustness
    const allHeaders = new Set();
    data.forEach((row) => {
        Object.keys(row).forEach((key) => allHeaders.add(key));
    });
    const headers = Array.from(allHeaders);

    const headerRow = headers.join(" | ");
    const separator = "—".repeat(headerRow.length > 80 ? 80 : headerRow.length); // Dynamic separator length

    const rows = data.map((row) =>
        headers
            .map((h) => {
                let value =
                    row[h] !== undefined && row[h] !== null
                        ? String(row[h])
                        : "";
                // Truncate long values for preview
                if (value.length > 30) value = value.substring(0, 27) + "...";
                return value;
            })
            .join(" | "),
    );
    return [headerRow, separator, ...rows].join("\n");
}

// HELPER FUNCTION: Formats JSON data for display in <pre> tags
function formatJson(data) {
    if (!Array.isArray(data)) return "No data or invalid format";
    return data.length === 0 ? "No records" : JSON.stringify(data, null, 2);
}

// Clear all uploaded files, results, but NOT history
function clearAll() {
    document.getElementById("internalFile").value = "";
    document.getElementById("providerFile").value = "";
    document.getElementById("results").innerHTML = "";
    lastReconciliationResult = null; // Clear the global result
    const preview = document.getElementById("filePreviews");
    if (preview) {
        preview.innerHTML = "";
        preview.style.display = "none"; // Hide preview section
    }
    const columnInfo = document.getElementById("columnInfo");
    if (columnInfo) {
        columnInfo.innerHTML = "";
        columnInfo.style.display = "none"; // Hide column info
    }
    renderHistory(); // Re-render history to ensure its state is correct even if empty
    showMessage("Current results cleared! History remains intact.", 3000);
}

// LOCAL STORAGE LOGIC: Save reconciliation results to history
function saveHistory(entryData) {
    const history = JSON.parse(
        localStorage.getItem("reconciliationHistory") || "[]",
    );

    const entry = {
        timestamp: new Date().toLocaleString(),
        internalFileName: entryData.internalFileName,
        providerFileName: entryData.providerFileName,
        internalData: entryData.internalData, // Save original data for re-viewing
        providerData: entryData.providerData, // Save original data for re-viewing
        result: entryData.result,
    };

    history.unshift(entry); // Add newest entry to the beginning
    localStorage.setItem("reconciliationHistory", JSON.stringify(history));
    renderHistory(); // Update history display
}

// LOCAL STORAGE LOGIC: Render reconciliation history
function renderHistory() {
    let historySection = document.getElementById("history");
    if (!historySection) {
        historySection = createHistoryContainer();
    }
    const history = JSON.parse(
        localStorage.getItem("reconciliationHistory") || "[]",
    );

    if (!history.length) {
        historySection.style.display = "none"; // Hide if empty
        return;
    }

    historySection.style.display = "block"; // Show if there's history

    const rows = history
        .map((entry, index) => {
            const summary = entry.result || {
                matched: [],
                internalOnly: [],
                providerOnly: [],
                partialMismatches: [],
            };

            return `
            <div class="history-entry">
                <strong>${entry.timestamp}</strong><br>
                <span>🗂 ${entry.internalFileName || "Internal.csv"} vs. ${entry.providerFileName || "Provider.csv"}</span><br>
                <span>✅ ${summary.matched.length} matched,
                ⚠️ ${summary.internalOnly.length} internal-only,
                ❌ ${summary.providerOnly.length} provider-only,
                ⚠️ ${summary.partialMismatches.length} mismatched</span>
                <div class="history-actions">
                    <button onclick="viewHistoryEntry(${index})"> View</button>
                    <button onclick="downloadHistoryEntry(${index})">⬇️ Download</button>
                    <button onclick="deleteHistoryEntry(${index})">🗑️ Delete</button>
                </div>
            </div>
        `;
        })
        .join("");

    historySection.innerHTML = `<h3>🕘 History</h3>${rows}`;
}

// View a specific history entry
function viewHistoryEntry(index) {
    const history = JSON.parse(
        localStorage.getItem("reconciliationHistory") || "[]",
    );
    const entry = history[index];
    if (!entry) {
        showMessage("History entry not found.", 3000);
        return;
    }

    // Ensure history section is visible if not already
    const historySection = document.getElementById("history");
    if (historySection) {
        historySection.style.display = "block";
    }

    // Set the global result for this history entry to allow download
    lastReconciliationResult = entry.result;

    // Display the results and previews for the selected history entry
    displayResults(entry.result);
    renderMiniPreviews(entry.internalData, entry.providerData);
    displayColumnInfo(entry.result.inferredColumns); // Show inferred columns for historical entry

    // Scroll to the top of the page to show the new results
    window.scrollTo({ top: 0, behavior: "smooth" });
    showMessage("Viewing historical reconciliation results.", 3000);
}

// Delete a specific history entry
function deleteHistoryEntry(index) {
    let history = JSON.parse(
        localStorage.getItem("reconciliationHistory") || "[]",
    );
    if (index < 0 || index >= history.length) {
        showMessage("Invalid history entry index.", 3000);
        return;
    }

    history.splice(index, 1); // Remove one item at position index
    localStorage.setItem("reconciliationHistory", JSON.stringify(history));
    renderHistory(); // Re-render history after deletion
    showMessage("History entry deleted!", 3000);
}

// Download a specific history entry as a JSON file
function downloadHistoryEntry(index) {
    const history = JSON.parse(
        localStorage.getItem("reconciliationHistory") || "[]",
    );
    const entry = history[index];
    if (!entry) {
        showMessage("History entry not found.", 3000);
        return;
    }

    const fullContent = {
        timestamp: entry.timestamp,
        internalFileName: entry.internalFileName,
        providerFileName: entry.providerFileName,
        internalData: entry.internalData,
        providerData: entry.providerData,
        result: entry.result,
    };

    const blob = new Blob([JSON.stringify(fullContent, null, 2)], {
        type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `reconciliation_history_${entry.timestamp.replace(/[^\d]/g, "")}.json`;
    link.click();
    showMessage("Downloading history entry...", 2000);
}

// Helper to create the history container if it's not exist
function createHistoryContainer() {
    const container = document.createElement("section");
    container.id = "history";
    container.className = "history-section";
    container.style.display = "none"; // Start hidden
    const results = document.getElementById("results");
    // Insert history section right after the results section
    results.parentNode.insertBefore(container, results.nextSibling);
    return container;
}

// Scroll to the history section
function scrollToHistory() {
    renderHistory(); // Ensure history is up to date and rendered
    const historySection = document.getElementById("history");
    if (historySection && historySection.style.display !== "none") {
        historySection.scrollIntoView({ behavior: "smooth" });
    } else {
        showMessage("No history to display yet.", 3000);
    }
}

// Initial setup on page load
window.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("introModal");

    // Only show modal if it hasn't been dismissed in this session
    if (!sessionStorage.getItem("modalDismissed")) {
        modal.classList.add("show"); // Use class to trigger animation
    } else {
        modal.style.display = "none"; // Keep hidden if already dismissed
    }

    // Render history if available
    renderHistory();
});
