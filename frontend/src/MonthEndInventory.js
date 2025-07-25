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
  // Load month end workflow state from localStorage or use default values
  const [sku, setSku] = useState(() => localStorage.getItem('monthEnd_sku') || '');
  const [message, setMessage] = useState(() => localStorage.getItem('monthEnd_message') || '');
  const [spreadsheetMatch, setSpreadsheetMatch] = useState(() => {
    const saved = localStorage.getItem('monthEnd_spreadsheetMatch');
    return saved && saved !== 'undefined' ? JSON.parse(saved) : null;
  });
  const [showManualRef, setShowManualRef] = useState(() => localStorage.getItem('monthEnd_showManualRef') === 'true');
  const [manualRef, setManualRef] = useState(() => localStorage.getItem('monthEnd_manualRef') || '');
  const [pendingSku, setPendingSku] = useState(() => localStorage.getItem('monthEnd_pendingSku') || '');
  const [descriptionResult, setDescriptionResult] = useState(() => localStorage.getItem('monthEnd_descriptionResult') || '');
  const [qcFlaw, setQcFlaw] = useState(() => localStorage.getItem('monthEnd_qcFlaw') || 'none');
  const [price, setPrice] = useState(() => {
    const saved = localStorage.getItem('monthEnd_price');
    return saved && saved !== 'undefined' ? JSON.parse(saved) : null;
  });
  const [totalPrice, setTotalPrice] = useState(() => {
    const saved = localStorage.getItem('monthEnd_totalPrice');
    return saved && saved !== 'undefined' ? parseFloat(saved) : 0;
  });
  const [requireSerial, setRequireSerial] = useState(() => localStorage.getItem('monthEnd_requireSerial') === 'true');
  const [serialNumber, setSerialNumber] = useState(() => localStorage.getItem('monthEnd_serialNumber') || '');
  const [selectedMachine, setSelectedMachine] = useState(() => localStorage.getItem('monthEnd_selectedMachine') || '');
  const [showNewProductForm, setShowNewProductForm] = useState(() => localStorage.getItem('monthEnd_showNewProductForm') === 'true');
  const [newProduct, setNewProduct] = useState(() => {
    const saved = localStorage.getItem('monthEnd_newProduct');
    return saved && saved !== 'undefined' ? JSON.parse(saved) : {
      barcode: "",
      description: "",
      size: "",
      price: "",
      qcFlaw: "none",
      manualRef: "",
      mfr: "",
    };
  });
  const [scannedItems, setScannedItems] = useState(() => {
    const saved = localStorage.getItem('monthEnd_scannedItems');
    return saved && saved !== 'undefined' ? JSON.parse(saved) : [];
  });
  const [quantity, setQuantity] = useState(() => {
    const saved = localStorage.getItem('monthEnd_quantity');
    return saved && saved !== 'undefined' ? parseInt(saved) : 1;
  });
  const skuInputRef = useRef(null);
  const manualRefInputRef = useRef(null);

  // MongoDB data states for Month End collections
  const [monthEndInventoryData, setMonthEndInventoryData] = useState([]);
  const [monthEndOverstockData, setMonthEndOverstockData] = useState([]);
  const [magentoInventoryData, setMagentoInventoryData] = useState([]);
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

  // Save month end workflow state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('monthEnd_sku', sku);
  }, [sku]);

  useEffect(() => {
    localStorage.setItem('monthEnd_message', message);
  }, [message]);

  useEffect(() => {
    localStorage.setItem('monthEnd_spreadsheetMatch', JSON.stringify(spreadsheetMatch));
  }, [spreadsheetMatch]);

  useEffect(() => {
    localStorage.setItem('monthEnd_showManualRef', showManualRef.toString());
  }, [showManualRef]);

  useEffect(() => {
    localStorage.setItem('monthEnd_manualRef', manualRef);
  }, [manualRef]);

  useEffect(() => {
    localStorage.setItem('monthEnd_pendingSku', pendingSku);
  }, [pendingSku]);

  useEffect(() => {
    localStorage.setItem('monthEnd_descriptionResult', descriptionResult);
  }, [descriptionResult]);

  useEffect(() => {
    localStorage.setItem('monthEnd_qcFlaw', qcFlaw);
  }, [qcFlaw]);

  useEffect(() => {
    localStorage.setItem('monthEnd_price', JSON.stringify(price));
  }, [price]);

  useEffect(() => {
    localStorage.setItem('monthEnd_totalPrice', totalPrice.toString());
  }, [totalPrice]);

  useEffect(() => {
    localStorage.setItem('monthEnd_requireSerial', requireSerial.toString());
  }, [requireSerial]);

  useEffect(() => {
    localStorage.setItem('monthEnd_serialNumber', serialNumber);
  }, [serialNumber]);

  useEffect(() => {
    localStorage.setItem('monthEnd_selectedMachine', selectedMachine);
  }, [selectedMachine]);

  useEffect(() => {
    localStorage.setItem('monthEnd_showNewProductForm', showNewProductForm.toString());
  }, [showNewProductForm]);

  useEffect(() => {
    localStorage.setItem('monthEnd_newProduct', JSON.stringify(newProduct));
  }, [newProduct]);

  useEffect(() => {
    localStorage.setItem('monthEnd_scannedItems', JSON.stringify(scannedItems));
  }, [scannedItems]);

  useEffect(() => {
    localStorage.setItem('monthEnd_quantity', quantity.toString());
  }, [quantity]);

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

    // Refresh Magento Inventory data
    axios
      .get(`${apiUrl}/api/magento-inventory`)
      .then((res) => {
        console.log("Refreshed Magento Inventory Data:", res.data.data);
        setMagentoInventoryData(res.data.data);
      })
      .catch(() => setMagentoInventoryData([]));
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

  // Fetch Magento Inventory data
  useEffect(() => {
    axios
      .get(`${apiUrl}/api/magento-inventory`)
      .then((res) => {
        console.log("Magento Inventory Data:", res.data.data);
        setMagentoInventoryData(res.data.data);
      })
      .catch(() => setMagentoInventoryData([]));
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
          quantity,
        });

        setMessage(res.data.message);
        setPrice(res.data.price);
        setTotalPrice((prev) => prev + (res.data.price * quantity));

        // Add to scannedItems
        setScannedItems((prev) => [...prev, {
          upc: sku,
          description: sku,
          price: res.data.price,
          qcFlaw: qcFlaw,
          serialNumber: serialNumber,
          quantity: quantity
        }]);

        setSku("");
        setQcFlaw("none");
        setSerialNumber("");
        setQuantity(1);

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
        quantity,
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
      setTotalPrice((prev) => prev + (res.data.price * quantity));

      // Add to scannedItems
      setScannedItems((prev) => [...prev, {
        upc: sku,
        description: res.data.row?.Description || res.data.row?.Name || res.data.row?.Style || sku,
        price: res.data.price,
        qcFlaw: qcFlaw,
        serialNumber: serialNumber,
        quantity: quantity
      }]);

      setSku("");
      setQcFlaw("none");
      setSerialNumber("");
      setQuantity(1);

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
        barcode: pendingSku === "NO_BARCODE" ? null : pendingSku,
        manualRef,
        sessionId,
        qcFlaw,
        serialNumber,
        quantity,
      });

      if (res.data.match) {
        setMessage(res.data.message);
        setSpreadsheetMatch(res.data.spreadsheetMatch);
        setDescriptionResult(res.data.descriptionResult);
        setPrice(res.data.price);
        setTotalPrice((prev) => prev + (res.data.price * quantity));

        // Add to scannedItems
        setScannedItems((prev) => [...prev, {
          upc: pendingSku,
          description: res.data.descriptionResult?.description || pendingSku,
          price: res.data.price,
          qcFlaw: qcFlaw,
          serialNumber: serialNumber,
          quantity: quantity
        }]);

        setShowManualRef(false);
        setPendingSku("");
        setManualRef("");
        setSku("");
        setQcFlaw("none");
        setSerialNumber("");
        setQuantity(1);

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
        barcode: newProduct.barcode === "NO_BARCODE" ? null : newProduct.barcode,
        sessionId,
        serialNumber,
        quantity,
      });

      setMessage(res.data.message);
      setTotalPrice((prev) => prev + ((Number(newProduct.price) || 0) * quantity));

      // Add to scannedItems
      setScannedItems((prev) => [...prev, {
        upc: newProduct.barcode === "NO_BARCODE" ? null : newProduct.barcode,
        description: newProduct.description,
        price: Number(newProduct.price) || 0,
        qcFlaw: newProduct.qcFlaw,
        serialNumber: serialNumber,
        quantity: quantity
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
      
      // Clear month end workflow state from localStorage
      clearMonthEndWorkflowState();
      
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

  // Add undo function
  const handleUndo = async () => {
    try {
      setMessage("Processing undo...");
      const res = await axios.post(`${apiUrl}/api/barcode/undo`, {
        sessionId
      });
      
      if (res.data.action === "clearPendingState") {
        // Handle clearing pending states (manual ref or new product forms)
        if (res.data.pendingType === "manualReference") {
          setShowManualRef(false);
          setManualRef("");
          setPendingSku("");
          setSku("");
          setMessage(`Cancelled manual reference for: ${res.data.clearedSku}`);
        } else if (res.data.pendingType === "newProduct") {
          setShowNewProductForm(false);
          setShowManualRef(false);
          setManualRef("");
          setPendingSku("");
          setSku("");
          setNewProduct({
            barcode: "",
            description: "",
            size: "",
            price: "",
            qcFlaw: "none",
            manualRef: "",
            mfr: "",
          });
          setMessage(`Cancelled new product form for: ${res.data.clearedSku}`);
        }
      } else if (res.data.action === "undoLastScan") {
        // Handle undoing completed scans
        const undonePriceValue = Number(res.data.undoneItem.price) || 0;
        const undoneQuantity = Number(res.data.undoneItem.quantity) || 1;
        setTotalPrice(prev => Math.max(0, prev - (undonePriceValue * undoneQuantity)));
        
        // Remove from scannedItems list
        setScannedItems(prev => prev.slice(0, -1));
        
        setMessage(`Undone: ${res.data.undoneItem.description} (${res.data.remainingItems} items remaining)`);
      }
      
      // Clear any current form state
      setSku("");
      setPrice(null);
      setDescriptionResult("");
      setQcFlaw("none");
      setSerialNumber("");
      setQuantity(1);
      
      // Refresh the month end data to reflect changes
      refreshMonthEndData();
      
    } catch (err) {
      setMessage(err.response?.data?.error || "Failed to undo last scan");
    }
  };

  // Function to handle CSV export
  const handleExportCSV = async () => {
    try {
      let endpoint;
      if (selectedCollection === "monthEndInventory") {
        endpoint = "/api/month-end-inventory/export-csv";
      } else if (selectedCollection === "monthEndOverstock") {
        endpoint = "/api/month-end-overstock/export-csv";
      } else if (selectedCollection === "magentoInventory") {
        endpoint = "/api/magento-inventory/export-csv";
      }
      
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
      
      const collectionNames = {
        monthEndInventory: "Inventory",
        monthEndOverstock: "Overstock", 
        magentoInventory: "Magento Inventory"
      };
      setMessage(`${collectionNames[selectedCollection]} CSV exported successfully!`);
    } catch (error) {
      console.error("Error exporting CSV:", error);
      setMessage("Failed to export CSV. Please try again.");
    }
  };

  // Determine which data to show
  let tableData = [];
  if (selectedCollection === "monthEndInventory") tableData = monthEndInventoryData;
  else if (selectedCollection === "monthEndOverstock") tableData = monthEndOverstockData;
  else if (selectedCollection === "magentoInventory") tableData = magentoInventoryData;

  const fieldOrders = {
    monthEndInventory: ["RefNum", "UPC", "MFR", "Style", "Size", "Quantity", "Price", "Date"],
    monthEndOverstock: ["RefNum", "UPC", "MFR", "Style", "Size", "Quantity", "Price", "Date"],
    magentoInventory: ["RefNum", "UPC", "MFR", "Style", "Size", "Quantity", "Price", "Date", "QcFlaw", "SerialNumber", "Source"],
  };
  const currentFieldOrder = fieldOrders[selectedCollection] || [];

  // Function to clear month end workflow state from localStorage
  const clearMonthEndWorkflowState = () => {
    const keysToRemove = [
      'monthEnd_sku',
      'monthEnd_message',
      'monthEnd_spreadsheetMatch',
      'monthEnd_showManualRef',
      'monthEnd_manualRef',
      'monthEnd_pendingSku',
      'monthEnd_descriptionResult',
      'monthEnd_qcFlaw',
      'monthEnd_price',
      'monthEnd_totalPrice',
      'monthEnd_requireSerial',
      'monthEnd_serialNumber',
      'monthEnd_selectedMachine',
      'monthEnd_showNewProductForm',
      'monthEnd_newProduct',
      'monthEnd_scannedItems',
      'monthEnd_quantity'
    ];
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });
  };

  const handleNoBarcodeEntry = () => {
    // Bypass UPC entirely - go directly to manual reference with no UPC
    setShowManualRef(true);
    setPendingSku("NO_BARCODE"); // Use a special placeholder to indicate no barcode
    setSku(""); // Clear any existing UPC
    setMessage("No barcode available. Enter manual reference:");
  };

  const handleManualEntry = (currentSku) => {
    const skuToUse = currentSku || sku;
    if (!skuToUse.trim()) {
      setMessage("Please enter a UPC before using manual entry.");
      return;
    }
    // Directly show manual reference form with the current SKU as pending
    setShowManualRef(true);
    setPendingSku(skuToUse);
    setMessage("Enter manual reference for the item:");
  };

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
            quantity={quantity}
            setQuantity={setQuantity}
            onManualEntry={handleManualEntry}
            onNoBarcodeEntry={handleNoBarcodeEntry}
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

          {/* Add the Undo Button */}
          <button
            className="btn btn-warning w-full mb-4"
            onClick={handleUndo}
          >
            ↶ Undo Last Scan
          </button>

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
              <h3 className="font-bold mb-2">
                Scanned Items ({scannedItems.reduce((total, item) => total + (item.quantity || 1), 0)} items)
              </h3>
              <div className="max-h-40 overflow-y-auto">
                {scannedItems.map((item, index) => (
                  <div key={index} className="text-sm mb-1">
                    {item.description}
                    {item.quantity && item.quantity > 1 ? ` (x${item.quantity})` : ""} 
                    - ${item.price}
                    {item.quantity && item.quantity > 1 ? ` (Total: $${(item.price * item.quantity).toFixed(2)})` : ""}
                  </div>
                ))}
              </div>
              <div className="font-bold mt-2">
                Total: ${scannedItems.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0).toFixed(2)}
              </div>
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
                <option value="magentoInventory">Magento Inventory</option>
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
