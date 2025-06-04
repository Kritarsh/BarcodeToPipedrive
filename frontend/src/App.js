import React, { useState, useEffect } from "react";
import axios from "axios";

const apiUrl = process.env.REACT_APP_API_URL;

function App() {
  const [sessionId] = useState(() => Math.random().toString(36).substr(2, 9));
  const [trackingNumber, setTrackingNumber] = useState("");
  const [sku, setSku] = useState("");
  const [dealFound, setDealFound] = useState(false);
  const [message, setMessage] = useState("");
  const [spreadsheetMatch, setSpreadsheetMatch] = useState(null);
  const [excelData, setExcelData] = useState({
    "Inventory Supplies 2024.xlsx": [],
    "MagentoInventory.xlsx": [],
    "Overstock supplies other companies.xlsx": [],
  });
  const [selectedFile, setSelectedFile] = useState(
    "Inventory Supplies 2024.xlsx"
  );
  const [showManualRef, setShowManualRef] = useState(false);
  const [manualRef, setManualRef] = useState("");
  const [pendingSku, setPendingSku] = useState(""); // Store the SKU for manual ref
  const [descriptionResult, setDescriptionResult] = useState("");
  const [qcFlaw, setQcFlaw] = useState("none");
  const [price, setPrice] = useState(null);
  const [totalPrice, setTotalPrice] = useState(0);

  useEffect(() => {
    const files = [
      "Inventory Supplies 2024.xlsx",
      "MagentoInventory.xlsx",
      "Overstock supplies other companies.xlsx",
    ];
    files.forEach(async (file) => {
      try {
        const res = await axios.get(
          `${apiUrl}/api/excel/${encodeURIComponent(file)}`
        );
        setExcelData((prevData) => ({
          ...prevData,
          [file]: res.data.data,
        }));
      } catch (err) {
        console.error(`Error loading ${file}:`, err);
      }
    });
  }, []);

  const handleTrackingSubmit = async (e) => {
    e.preventDefault();
    setMessage("Searching for deal...");
    try {
      const res = await axios.post(`${apiUrl}/api/barcode`, {
        scanType: "tracking",
        barcode: trackingNumber,
        sessionId,
      });
      setDealFound(true);
      setMessage("Deal found! Now scan SKU.");
    } catch (err) {
      setMessage(err.response?.data?.error || "Deal not found.");
    }
  };

  const handleSkuSubmit = async (e) => {
    e.preventDefault();
    setMessage("Checking SKU...");
    setShowManualRef(false);
    setManualRef("");
    setPrice(null);

    try {
      const res = await axios.post(`${apiUrl}/api/barcode`, {
        scanType: "sku",
        barcode: sku,
        sessionId,
        qcFlaw, // send QC flaw to backend if needed
      });

      setSpreadsheetMatch(res.data.spreadsheetMatch);
      setMessage(
        res.data.spreadsheetMatch
          ? "SKU found and note added!"
          : "SKU not found, note added."
      );

      // Show manual reference form if not found
      if (!res.data.spreadsheetMatch) {
        setShowManualRef(true);
        setPendingSku(sku); // Store the SKU for manual reference
      }
      setSku("");

      // --- USE PRICE FROM BACKEND ONLY ---
      console.log("Price from backend:", res.data.price);
      setPrice(res.data.price);

      // Only add to total if not a QC flaw and price is a number
      if (qcFlaw !== "flaw" && !isNaN(res.data.price)) {
        setTotalPrice((prev) => prev + res.data.price);
      }
    } catch (err) {
      setMessage(err.response?.data?.error || "Error checking SKU.");
    }
  };

  const handleManualRefSubmit = async (e) => {
    e.preventDefault();
    setMessage("Checking manual reference...");
    setDescriptionResult("");
    // Try to get a description from the selected Excel row (if available)
    let description = "";
    const selectedRows = excelData[selectedFile];
    const matchedRow = selectedRows.find((row) =>
      Object.values(row).some(
        (val) => val && val.toString().toLowerCase() === manualRef.toLowerCase()
      )
    );
    if (matchedRow) {
      description =
        matchedRow.Description ||
        matchedRow["description"] ||
        Object.values(matchedRow)[0] ||
        "";
    }
    try {
      const retryRes = await axios.post(`${apiUrl}/api/barcode/manual`, {
        barcode: pendingSku,
        manualRef,
        sessionId,
        description,
      });
      setSpreadsheetMatch(retryRes.data.spreadsheetMatch);
      setMessage(
        retryRes.data.spreadsheetMatch
          ? "SKU found and note added!"
          : retryRes.data.descriptionMatch
          ? "SKU not found by manual reference, but found by description!"
          : "SKU not found, note added."
      );
      setShowManualRef(false);
      setManualRef("");
      setPendingSku("");
      setDescriptionResult(retryRes.data.descriptionResult);
    } catch (err) {
      setMessage(
        err.response?.data?.error || "Error checking manual reference."
      );
    }
  };

  // --- Inline Excel Viewer UI ---
  const fileOptions = Object.keys(excelData);

  return (
    <div className="min-h-screen w-full bg-base-200 flex">
      <div className="bg-base-100 shadow-xl w-[30%] p-6">
        <div className="card-body">
          <h1 className="card-title text-3xl justify mb-6 text-primary">
            Barcode to Pipedrive
          </h1>
          <form onSubmit={handleTrackingSubmit} className="mb-6">
            <label className="block mb-2 font-medium text-white">
              Tracking Number:
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                required
                disabled={dealFound}
                className="input input-bordered w-full mt-1 disabled:bg-base-200"
              />
            </label>
            <button
              type="submit"
              disabled={dealFound}
              className="btn btn-primary w-full"
            >
              Scan Tracking
            </button>
          </form>
          {dealFound && (
            <>
              <form onSubmit={handleSkuSubmit} className="mb-6">
                <label className="block mb-2 font-medium text-white">
                  UPC:
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    required
                    className="input input-bordered w-full mt-1"
                  />
                </label>
                <label className="block mb-2 font-medium text-white">
                  Quality Control:
                  <select
                    value={qcFlaw}
                    onChange={(e) => setQcFlaw(e.target.value)}
                    className="select select-bordered w-full mt-1"
                  >
                    <option value="none">No Flaw</option>
                    <option value="flaw">Missing Part </option>
                    <option value="damaged">Damaged</option>
                    <option value="other">Not in Original Packaging</option>
                  </select>
                </label>
                <button type="submit" className="btn btn-success w-full">
                  Scan UPC
                </button>
              </form>
              {showManualRef && (
                <form onSubmit={handleManualRefSubmit} className="mb-6">
                  <label className="block mb-2 font-medium text-white">
                    Manual Reference Number:
                    <input
                      type="text"
                      value={manualRef}
                      onChange={(e) => setManualRef(e.target.value)}
                      required
                      className="input input-bordered w-full mt-1"
                    />
                  </label>
                  <button type="submit" className="btn btn-warning w-full">
                    Submit Manual Reference
                  </button>
                </form>
              )}
              <button
                className="btn btn-secondary w-full mb-4"
                onClick={async () => {
                  // Send the current tracking number to backend to flush notes
                  if (trackingNumber) {
                    try {
                      await axios.post(`${apiUrl}/api/barcode`, {
                        scanType: "tracking",
                        barcode: trackingNumber,
                        sessionId,
                      });
                    } catch (err) {
                      // Optionally handle error
                      setMessage("Failed to finalize previous tracking batch.");
                    }
                  }
                  // Now reset frontend state for new tracking
                  setDealFound(false);
                  setTrackingNumber("");
                  setSku("");
                  setShowManualRef(false);
                  setManualRef("");
                  setPendingSku("");
                  setMessage("");
                  setSpreadsheetMatch(null);
                  setDescriptionResult("");
                  setPrice(null);
                  setTotalPrice(0);
                }}
              >
                Start New Tracking Number
              </button>
            </>
          )}
          {message && (
            <div className="alert alert-info text-center mb-2">{message}</div>
          )}
          {spreadsheetMatch !== null && (
            <div className="text-center text-sm text-white">
              Spreadsheet Match:{" "}
              <span
                className={
                  spreadsheetMatch
                    ? "text-success font-semibold"
                    : "text-error font-semibold"
                }
              >
                {spreadsheetMatch ? "Yes" : "No"}
              </span>
            </div>
          )}
          {descriptionResult && descriptionResult.description && (
            <div className="alert alert-success text-center mb-2">
              Product Description: {descriptionResult.description}
            </div>
          )}
          {typeof price === "number" && !isNaN(price) && (
            <div className="alert alert-info text-center mb-2">
              Price: ${price.toFixed(2)}
            </div>
          )}
          {typeof totalPrice === "number" && !isNaN(totalPrice) && (
            <div className="alert alert-info text-center mb-2">
              Total Price: ${totalPrice.toFixed(2)}
            </div>
          )}
        </div>
      </div>
      <div className="bg-base-100 rounded-xl shadow-lg p-6 w-[70%]">
        <h2 className="text-2xl font-bold mb-4">Excel File Viewer</h2>
        <div className="mb-4">
          <label className="font-semibold mr-2">Select file:</label>
          <select
            className="select select-bordered"
            value={selectedFile}
            onChange={(e) => setSelectedFile(e.target.value)}
          >
            {fileOptions.map((file) => (
              <option key={file} value={file}>
                {file}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="table table-xs border border-white border-solid">
            <thead>
              <tr>
                {excelData[selectedFile][0] &&
                  Object.keys(excelData[selectedFile][0]).map((col) => (
                    <th
                      key={col}
                      className="border border-white border-solid bg-base-100 text-base-content"
                    >
                      {col}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {excelData[selectedFile].map((row, i) => (
                <tr key={i}>
                  {Object.values(row).map((val, j) => (
                    <td
                      key={j}
                      className="border border-white border-solid bg-base-100 text-base-content"
                    >
                      {val}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {excelData[selectedFile].length === 0 && (
            <div className="text-gray-400 text-center mt-4">
              No data to display.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
