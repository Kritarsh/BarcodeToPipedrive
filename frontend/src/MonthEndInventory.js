import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import SkuForm from "./SkuForm";
import ManualRefForm from "./ManualRefForm";

const apiUrl = process.env.REACT_APP_API_URL;

function MonthEndInventory() {
  const [sessionId] = useState(() => {
    const id = Math.random().toString(36).substr(2, 9);
    console.log(`[Month End Session Start] New session ID created: ${id}`);
    return id;
  });
  const [sku, setSku] = useState("");
  const [message, setMessage] = useState("");
  const [spreadsheetMatch, setSpreadsheetMatch] = useState(null);
  const [showManualRef, setShowManualRef] = useState(false);
  const [manualRef, setManualRef] = useState("");
  const [pendingSku, setPendingSku] = useState("");
  const [descriptionResult, setDescriptionResult] = useState("");
  const [qcFlaw, setQcFlaw] = useState("none");
  const [price, setPrice] = useState(null);
  const [totalPrice, setTotalPrice] = useState(0);
  const [requireSerial, setRequireSerial] = useState(false);
  const [serialNumber, setSerialNumber] = useState("");
  const [selectedMachine, setSelectedMachine] = useState("");
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [newProduct, setNewProduct] = useState({
    barcode: "",
    description: "",
    size: "",
    price: "",
    qcFlaw: "none",
    manualRef: "",
    mfr: "",
  });
  const [scannedItems, setScannedItems] = useState([]);
  const skuInputRef = useRef(null);
  const manualRefInputRef = useRef(null);

  // MongoDB data states for Month End collections
  const [monthEndInventoryData, setMonthEndInventoryData] = useState([]);
  const [monthEndOverstockData, setMonthEndOverstockData] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState("monthEndInventory");

  useEffect(() => {
    if (skuInputRef.current) {
      skuInputRef.current.focus();
    }
  }, []);

  // Focus manual reference input only when the form is shown
  useEffect(() => {
    if (showManualRef && manualRefInputRef.current) {
      manualRefInputRef.current.focus();
    }
  }, [showManualRef]);

  // Function to refresh month end data
  const refreshMonthEndData = () => {
    // Refresh Month End Inventory data
    axios
      .get(`${apiUrl}/api/month-end-inventory`)
      .then((res) => {
        console.log("Refreshed Month End Inventory Data:", res.data.data);
        setMonthEndInventoryData(res.data.data);
      })
      .catch(() => setMonthEndInventoryData([]));

    // Refresh Month End Overstock data
    axios
      .get(`${apiUrl}/api/month-end-overstock`)
      .then((res) => {
        console.log("Refreshed Month End Overstock Data:", res.data.data);
        setMonthEndOverstockData(res.data.data);
      })
      .catch(() => setMonthEndOverstockData([]));
  };

  // Fetch Month End Inventory data
  useEffect(() => {
    axios
      .get(`${apiUrl}/api/month-end-inventory`)
      .then((res) => {
        console.log("Month End Inventory Data:", res.data.data);
        setMonthEndInventoryData(res.data.data);
      })
      .catch(() => setMonthEndInventoryData([]));
  }, []);

  // Fetch Month End Overstock data
  useEffect(() => {
    axios
      .get(`${apiUrl}/api/month-end-overstock`)
      .then((res) => {
        console.log("Month End Overstock Data:", res.data.data);
        setMonthEndOverstockData(res.data.data);
      })
      .catch(() => setMonthEndOverstockData([]));
  }, []);



  const handleSkuSubmit = async (e) => {
    e.preventDefault();
    if (!sku) return;

    try {
      // Check if it's a machine
      const machineKeywords = [
        "AirSense 10",  
        "AirSense 11",
        "AirCurve VAuto",
        "AirCurve ASV",
        "AirCurve ST",
        "Trilogy Evo",
        "AirMini AutoSet",
        "Astral",
        "Series 9 AutoSet",
        "Series 9 CPAP",
        "Series 9 BiPAP",
        "Series 9 Elite",
      ];
      const isMachine = machineKeywords.some((keyword) =>
        sku.toLowerCase().includes(keyword.toLowerCase())
      );

      if (isMachine) {
        const res = await axios.post(`${apiUrl}/api/month-end/barcode`, {
          scanType: "sku",
          barcode: sku,
          sessionId,
          qcFlaw,
          serialNumber,
        });

        setMessage(res.data.message);
        setPrice(res.data.price);
        setTotalPrice((prev) => prev + res.data.price);

        // Add to scannedItems
        setScannedItems((prev) => [...prev, {
          upc: sku,
          description: sku,
          price: res.data.price,
          qcFlaw: qcFlaw,
          serialNumber: serialNumber
        }]);

        setSku("");
        setQcFlaw("none");
        setSerialNumber("");

        // Refresh the month end data to show the new item
        refreshMonthEndData();
        return;
      }

      // Normal UPC flow for supplies
      const res = await axios.post(`${apiUrl}/api/month-end/barcode`, {
        scanType: "sku",
        barcode: sku,
        sessionId,
        qcFlaw,
        serialNumber,
      });

      if (res.data.match === false) {
        setMessage(res.data.message);
        setShowManualRef(true);
        setPendingSku(sku);
        return;
      }

      setMessage(res.data.message || "SKU processed successfully!");
      setSpreadsheetMatch(res.data.spreadsheetMatch);
      setDescriptionResult(res.data.descriptionResult);
      setPrice(res.data.price);
      setTotalPrice((prev) => prev + res.data.price);

      // Add to scannedItems
      setScannedItems((prev) => [...prev, {
        upc: sku,
        description: res.data.row?.Description || res.data.row?.Name || res.data.row?.Style || sku,
        price: res.data.price,
        qcFlaw: qcFlaw,
        serialNumber: serialNumber
      }]);

      setSku("");
      setQcFlaw("none");
      setSerialNumber("");

      // Refresh the month end data to show the new item
      refreshMonthEndData();
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleManualRefSubmit = async (e) => {
    e.preventDefault();
    if (!manualRef || !pendingSku) return;

    try {
      const res = await axios.post(`${apiUrl}/api/month-end/barcode/manual`, {
        barcode: pendingSku,
        manualRef,
        sessionId,
        qcFlaw,
        serialNumber,
      });

      if (res.data.match) {
        setMessage(res.data.message);
        setSpreadsheetMatch(res.data.spreadsheetMatch);
        setDescriptionResult(res.data.descriptionResult);
        setPrice(res.data.price);
        setTotalPrice((prev) => prev + res.data.price);

        // Add to scannedItems
        setScannedItems((prev) => [...prev, {
          upc: pendingSku,
          description: res.data.descriptionResult?.description || pendingSku,
          price: res.data.price,
          qcFlaw: qcFlaw,
          serialNumber: serialNumber
        }]);

        setShowManualRef(false);
        setPendingSku("");
        setManualRef("");
        setSku("");
        setQcFlaw("none");
        setSerialNumber("");

        // Refresh the month end data to show the new item
        refreshMonthEndData();
      } else {
        setMessage("SKU not found. Would you like to add it as a new product?");
        setShowNewProductForm(true);
        setNewProduct({
          barcode: pendingSku,
          description: "",
          size: "",
          price: "",
          qcFlaw: qcFlaw,
          manualRef: manualRef,
          mfr: "",
        });
      }
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleNewProductSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${apiUrl}/api/month-end/product/new`, {
        ...newProduct,
        sessionId,
        serialNumber,
      });

      setMessage(res.data.message);
      setTotalPrice((prev) => prev + (Number(newProduct.price) || 0));

      // Add to scannedItems
      setScannedItems((prev) => [...prev, {
        upc: newProduct.barcode,
        description: newProduct.description,
        price: Number(newProduct.price) || 0,
        qcFlaw: newProduct.qcFlaw,
        serialNumber: serialNumber
      }]);

      setShowNewProductForm(false);
      setShowManualRef(false);
      setPendingSku("");
      setManualRef("");
      setSku("");
      setQcFlaw("none");
      setSerialNumber("");
      setNewProduct({
        barcode: "",
        description: "",
        size: "",
        price: "",
        qcFlaw: "none",
        manualRef: "",
        mfr: "",
      });

      // Refresh the month end data to show the new item
      refreshMonthEndData();
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleFinishMonthEnd = async () => {
    try {
      const res = await axios.post(`${apiUrl}/api/month-end/finish`, {
        sessionId,
      });
      
      setMessage(res.data.message || "Month End inventory completed successfully.");
      setScannedItems([]);
      setSku("");
      setShowManualRef(false);
      setManualRef("");
      setPendingSku("");
      setSpreadsheetMatch(null);
      setDescriptionResult("");
      setPrice(null);
      setTotalPrice(0);
      setRequireSerial(false);
      setSerialNumber("");
      setSelectedMachine("");
      setShowNewProductForm(false);
      setQcFlaw("none");
      
      // Refresh the month end data to show any final updates
      refreshMonthEndData();
      
      console.log("Month End inventory completed and session reset");
    } catch (err) {
      setMessage(err.response?.data?.error || "Failed to complete month end inventory.");
    }
  };

  // Function to handle CSV export
  const handleExportCSV = async () => {
    try {
      const endpoint = selectedCollection === "monthEndInventory" 
        ? "/api/month-end-inventory/export-csv"
        : "/api/month-end-overstock/export-csv";
      
      const response = await fetch(`${apiUrl}${endpoint}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setMessage("No data available to export");
          return;
        }
        throw new Error("Failed to export CSV");
      }
      
      // Get the filename from the response headers
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `month-end-${selectedCollection}-export.csv`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setMessage(`${selectedCollection === "monthEndInventory" ? "Inventory" : "Overstock"} CSV exported successfully!`);
    } catch (error) {
      console.error("Error exporting CSV:", error);
      setMessage("Failed to export CSV. Please try again.");
    }
  };

  // Determine which data to show
  let tableData = [];
  if (selectedCollection === "monthEndInventory") tableData = monthEndInventoryData;
  else if (selectedCollection === "monthEndOverstock") tableData = monthEndOverstockData;

  const fieldOrders = {
    monthEndInventory: ["RefNum", "UPC", "MFR", "Style", "Size", "Quantity", "Price", "Date"],
    monthEndOverstock: ["RefNum", "UPC", "MFR", "Style", "Size", "Quantity", "Price", "Date"],
  };
  const currentFieldOrder = fieldOrders[selectedCollection] || [];

  return (
    <div className="min-h-screen w-full bg-base-200 flex">
      <div className="bg-base-100 shadow-xl w-[30%] p-6">
        <div className="card-body">
          <h1 className="card-title text-3xl justify mb-6 text-primary">
            Month End Inventory
          </h1>
          
          <SkuForm
            sku={sku}
            setSku={setSku}
            handleSkuSubmit={handleSkuSubmit}
            skuInputRef={skuInputRef}
            showManualRef={showManualRef}
            qcFlaw={qcFlaw}
            setQcFlaw={setQcFlaw}
          />

          {showManualRef && (
            <ManualRefForm
              manualRef={manualRef}
              setManualRef={setManualRef}
              handleManualRefSubmit={handleManualRefSubmit}
              manualRefInputRef={manualRefInputRef}
              qcFlaw={qcFlaw}
              setQcFlaw={setQcFlaw}
            />
          )}

          {showNewProductForm && (
            <form onSubmit={handleNewProductSubmit} className="mb-6">
              <h3 className="text-lg font-bold mb-4">Add New Product</h3>
              <input
                type="text"
                placeholder="Description"
                className="input input-bordered w-full mb-2"
                value={newProduct.description}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, description: e.target.value })
                }
                required
              />
              <input
                type="text"
                placeholder="Size"
                className="input input-bordered w-full mb-2"
                value={newProduct.size}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, size: e.target.value })
                }
              />
              <input
                type="number"
                step="0.01"
                placeholder="Price"
                className="input input-bordered w-full mb-2"
                value={newProduct.price}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, price: e.target.value })
                }
                required
              />
              <input
                type="text"
                placeholder="Manufacturer"
                className="input input-bordered w-full mb-2"
                value={newProduct.mfr}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, mfr: e.target.value })
                }
              />
              <button type="submit" className="btn btn-primary w-full">
                Add Product
              </button>
              <button
                type="button"
                className="btn btn-secondary w-full mt-2"
                onClick={() => setShowNewProductForm(false)}
              >
                Cancel
              </button>
            </form>
          )}

          {requireSerial && (
            <div className="mb-4">
              <label className="block mb-2 font-medium text-base-content">
                Serial Number:
                <input
                  type="text"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  className="input input-bordered w-full mt-1"
                  placeholder="Enter serial number"
                />
              </label>
            </div>
          )}

          {message && (
            <div className="alert alert-info mb-4">
              <span>{message}</span>
            </div>
          )}

          {scannedItems.length > 0 && (
            <div className="mb-4">
              <h3 className="font-bold mb-2">Scanned Items ({scannedItems.length})</h3>
              <div className="max-h-40 overflow-y-auto">
                {scannedItems.map((item, index) => (
                  <div key={index} className="text-sm mb-1">
                    {item.description} - ${item.price}
                  </div>
                ))}
              </div>
              <div className="font-bold mt-2">Total: ${totalPrice.toFixed(2)}</div>
              <button
                onClick={handleFinishMonthEnd}
                className="btn btn-success w-full mt-2"
              >
                Finish Month End Inventory
              </button>
            </div>
          )}

          <div className="mt-4">
            <a href="/" className="btn btn-outline w-full">
              Back to Main Inventory
            </a>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-4">Month End Data</h2>
            <div className="mb-4">
              <select
                className="select select-bordered w-full max-w-xs"
                value={selectedCollection}
                onChange={(e) => setSelectedCollection(e.target.value)}
              >
                <option value="monthEndInventory">Month End Inventory</option>
                <option value="monthEndOverstock">Month End Overstock</option>
              </select>
              <button
                onClick={handleExportCSV}
                className="btn btn-outline btn-primary ml-4"
                disabled={tableData.length === 0}
              >
                📊 Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              {tableData.length > 0 ? (
                <table className="table table-xs border border-base-content border-solid">
                  <thead>
                    <tr>
                      {currentFieldOrder.map((field) => (
                        <th
                          key={field}
                          className="border border-base-content border-solid bg-base-100 text-base-content"
                        >
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row, i) => (
                      <tr key={i}>
                        {currentFieldOrder.map((field, j) => (
                          <td
                            key={j}
                            className="border border-base-content border-solid bg-base-100 text-base-content"
                          >
                            {field === "Price" && row[field] !== undefined 
                              ? `$${(parseFloat(row[field].$numberDecimal || row[field]) || 0).toFixed(2)}`
                              : field === "Date" && row[field] !== undefined
                              ? new Date(row[field]).toLocaleDateString()
                              : row[field] !== undefined ? row[field] : "N/A"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-base-content opacity-60 text-center mt-4">
                  No data to display.
                </div>
              )}
            </div>
            <div className="mt-4">
              <button
                onClick={handleExportCSV}
                className="btn btn-primary w-full"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MonthEndInventory;
