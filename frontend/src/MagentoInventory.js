import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import SkuForm from "./SkuForm";
import ManualRefForm from "./ManualRefForm";

const apiUrl = process.env.REACT_APP_API_URL;

function MagentoInventory() {
  const [sessionId] = useState(() => {
    const id = Math.random().toString(36).substr(2, 9);
    console.log(`[Magento Inventory Session Start] New session ID created: ${id}`);
    return id;
  });
  
  // Load magento inventory workflow state from localStorage or use default values
  const [sku, setSku] = useState(() => localStorage.getItem('magento_sku') || '');
  const [message, setMessage] = useState(() => localStorage.getItem('magento_message') || '');
  const [spreadsheetMatch, setSpreadsheetMatch] = useState(() => {
    const saved = localStorage.getItem('magento_spreadsheetMatch');
    return saved && saved !== 'undefined' ? JSON.parse(saved) : null;
  });
  const [showManualRef, setShowManualRef] = useState(() => localStorage.getItem('magento_showManualRef') === 'true');
  const [manualRef, setManualRef] = useState(() => localStorage.getItem('magento_manualRef') || '');
  const [pendingSku, setPendingSku] = useState(() => localStorage.getItem('magento_pendingSku') || '');
  const [descriptionResult, setDescriptionResult] = useState(() => localStorage.getItem('magento_descriptionResult') || '');
  const [qcFlaw, setQcFlaw] = useState(() => localStorage.getItem('magento_qcFlaw') || 'none');
  const [price, setPrice] = useState(() => {
    const saved = localStorage.getItem('magento_price');
    return saved && saved !== 'undefined' ? JSON.parse(saved) : null;
  });
  const [totalPrice, setTotalPrice] = useState(() => {
    const saved = localStorage.getItem('magento_totalPrice');
    return saved && saved !== 'undefined' ? parseFloat(saved) : 0;
  });
  const [requireSerial, setRequireSerial] = useState(() => localStorage.getItem('magento_requireSerial') === 'true');
  const [serialNumber, setSerialNumber] = useState(() => localStorage.getItem('magento_serialNumber') || '');
  const [selectedMachine, setSelectedMachine] = useState(() => localStorage.getItem('magento_selectedMachine') || '');
  const [showNewProductForm, setShowNewProductForm] = useState(() => localStorage.getItem('magento_showNewProductForm') === 'true');
  const [newProduct, setNewProduct] = useState(() => {
    const saved = localStorage.getItem('magento_newProduct');
    return saved && saved !== 'undefined' ? JSON.parse(saved) : {
      name: "",
      refNum: "",
      price: "",
      quantity: "",
      manufacturer: "",
      size: "",
    };
  });
  const [scannedItems, setScannedItems] = useState(() => {
    const saved = localStorage.getItem('magento_scannedItems');
    return saved && saved !== 'undefined' ? JSON.parse(saved) : [];
  });
  const [quantity, setQuantity] = useState(() => {
    const saved = localStorage.getItem('magento_quantity');
    return saved && saved !== 'undefined' ? parseInt(saved) : 1;
  });
  const skuInputRef = useRef(null);
  const manualRefInputRef = useRef(null);

  // MongoDB data state for Magento Inventory
  const [magentoInventoryData, setMagentoInventoryData] = useState([]);

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

  // Save magento inventory workflow state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('magento_sku', sku);
  }, [sku]);

  useEffect(() => {
    localStorage.setItem('magento_message', message);
  }, [message]);

  useEffect(() => {
    localStorage.setItem('magento_spreadsheetMatch', JSON.stringify(spreadsheetMatch));
  }, [spreadsheetMatch]);

  useEffect(() => {
    localStorage.setItem('magento_showManualRef', showManualRef.toString());
  }, [showManualRef]);

  useEffect(() => {
    localStorage.setItem('magento_manualRef', manualRef);
  }, [manualRef]);

  useEffect(() => {
    localStorage.setItem('magento_pendingSku', pendingSku);
  }, [pendingSku]);

  useEffect(() => {
    localStorage.setItem('magento_descriptionResult', descriptionResult);
  }, [descriptionResult]);

  useEffect(() => {
    localStorage.setItem('magento_qcFlaw', qcFlaw);
  }, [qcFlaw]);

  useEffect(() => {
    localStorage.setItem('magento_price', JSON.stringify(price));
  }, [price]);

  useEffect(() => {
    localStorage.setItem('magento_totalPrice', totalPrice.toString());
  }, [totalPrice]);

  useEffect(() => {
    localStorage.setItem('magento_requireSerial', requireSerial.toString());
  }, [requireSerial]);

  useEffect(() => {
    localStorage.setItem('magento_serialNumber', serialNumber);
  }, [serialNumber]);

  useEffect(() => {
    localStorage.setItem('magento_selectedMachine', selectedMachine);
  }, [selectedMachine]);

  useEffect(() => {
    localStorage.setItem('magento_showNewProductForm', showNewProductForm.toString());
  }, [showNewProductForm]);

  useEffect(() => {
    localStorage.setItem('magento_newProduct', JSON.stringify(newProduct));
  }, [newProduct]);

  useEffect(() => {
    localStorage.setItem('magento_scannedItems', JSON.stringify(scannedItems));
  }, [scannedItems]);

  useEffect(() => {
    localStorage.setItem('magento_quantity', quantity.toString());
  }, [quantity]);

  // Function to refresh magento inventory data
  const refreshMagentoData = async () => {
    try {
      console.log("Refreshing Magento Inventory data...");
      // Add cache-busting parameter to ensure fresh data
      const timestamp = new Date().getTime();
      const res = await axios.get(`${apiUrl}/api/magento-inventory?t=${timestamp}`);
      console.log("Refreshed Magento Inventory Data:", res.data.data);
      console.log("Number of records received:", res.data.data ? res.data.data.length : 0);
      setMagentoInventoryData(res.data.data || []);
      setMessage(`Data refreshed successfully. Found ${res.data.data ? res.data.data.length : 0} records.`);
    } catch (error) {
      console.error("Error refreshing Magento Inventory data:", error);
      setMagentoInventoryData([]);
      setMessage("Error refreshing data: " + error.message);
    }
  };

  // Auto-refresh data when component becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log("Page became visible, refreshing Magento Inventory data...");
        refreshMagentoData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Fetch Magento Inventory data on component mount
  useEffect(() => {
    refreshMagentoData();
  }, []);

  const handleSkuSubmit = async (e) => {
    e.preventDefault();
    if (!sku) return;

    try {
      const res = await axios.post(`${apiUrl}/api/magento-inventory/barcode`, {
        barcode: sku,
        sessionId,
        qcFlaw,
        serialNumber,
        quantity,
      });

      // Check if the response indicates no match
      if (res.data.match === false) {
        console.log("No match found, showing manual reference form");
        setMessage(res.data.message || "SKU not found in Magento inventory.");
        setShowManualRef(true);
        setPendingSku(sku);
        return;
      }

      setMessage(res.data.message || "Success!");
      setPrice(res.data.price);
      setTotalPrice((prev) => prev + (res.data.price * quantity));
      setSpreadsheetMatch(res.data.spreadsheetMatch);
      setDescriptionResult(res.data.descriptionResult);

      // Add to scanned items
      setScannedItems((prev) => [...prev, {
        sku: sku,
        description: res.data.row?.Name || sku,
        price: res.data.price,
        qcFlaw: qcFlaw,
        serialNumber: serialNumber,
        quantity: quantity
      }]);

      setSku("");
      setQcFlaw("none");
      setSerialNumber("");
      setQuantity(1);

      // Refresh the magento data to show the new item
      refreshMagentoData();
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleManualRefSubmit = async (e) => {
    e.preventDefault();
    setMessage("Checking manual reference...");
    try {
      const res = await axios.post(`${apiUrl}/api/magento-inventory/barcode/manual`, {
        barcode: pendingSku,
        manualRef,
        sessionId,
        qcFlaw,
        serialNumber,
        quantity,
      });

      if (res.data.match) {
        setMessage(res.data.message || `Product found for reference ${manualRef}!`);
        setPrice(res.data.price);
        setTotalPrice((prev) => prev + (res.data.price * quantity));
        setSpreadsheetMatch(res.data.spreadsheetMatch);
        setDescriptionResult(res.data.descriptionResult);

        // Add to scanned items
        setScannedItems((prev) => [...prev, {
          sku: pendingSku,
          description: res.data.descriptionResult?.description || pendingSku,
          price: res.data.price,
          qcFlaw: qcFlaw,
          serialNumber: serialNumber,
          manualRef: manualRef,
          quantity: quantity
        }]);

        setShowManualRef(false);
        setManualRef("");
        setPendingSku("");
        setQuantity(1);
        setRequireSerial(false);
        setSerialNumber("");
        setQcFlaw("none");

        // Refresh the magento data
        refreshMagentoData();
      } else {
        setMessage(res.data.message || "Manual reference not found.");
        setShowNewProductForm(true);
        setNewProduct({
          name: "",
          refNum: manualRef,
          price: "",
          quantity: quantity || 1,
          manufacturer: "",
          size: "",
        });
      }
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleNewProductSubmit = async (e) => {
    e.preventDefault();
    setMessage("Adding new Magento product...");
    try {
      const res = await axios.post(`${apiUrl}/api/magento-inventory/new-product`, {
        product: {
          refNum: newProduct.refNum,
          barcode: pendingSku, // Use the original scanned barcode
          name: newProduct.name,
          price: newProduct.price,
          quantity: newProduct.quantity || quantity,
          manufacturer: newProduct.manufacturer,
          size: newProduct.size,
          qcFlaw: qcFlaw,
          serialNumber: serialNumber
        },
        sessionId,
      });

      setMessage(res.data.message || "Magento product added successfully!");
      setPrice(Number(newProduct.price) || 0);
      setTotalPrice((prev) => prev + (Number(newProduct.price) || 0) * quantity);

      // Add to scanned items
      setScannedItems((prev) => [...prev, {
        sku: pendingSku,
        description: newProduct.name,
        price: Number(newProduct.price) || 0,
        qcFlaw: qcFlaw,
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
        name: "",
        refNum: "",
        price: "",
        quantity: "",
        manufacturer: "",
        size: "",
      });

      // Refresh the magento data to show the new item
      refreshMagentoData();
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleFinishMagento = async () => {
    try {
      const res = await axios.post(`${apiUrl}/api/magento-inventory/finish`, {
        sessionId,
      });
      
      // Clear magento workflow state from localStorage
      clearMagentoWorkflowState();
      
      setMessage(res.data.message || "Magento inventory completed successfully.");
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
      
      // Refresh the magento data to show any final updates
      refreshMagentoData();
      
      console.log("Magento inventory completed and session reset");
    } catch (err) {
      setMessage(err.response?.data?.error || "Failed to complete magento inventory.");
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/magento-inventory/export-csv`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setMessage("No data available to export");
          return;
        }
        throw new Error("Failed to export CSV");
      }
      
      // Get the filename from the response headers
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `magento-inventory-export.csv`;
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
      
      setMessage("Magento Inventory CSV exported successfully!");
    } catch (error) {
      console.error("Error exporting CSV:", error);
      setMessage("Failed to export CSV. Please try again.");
    }
  };

  const fieldOrder = ["ID", "Name", "RefNum", "UPC", "Price", "Quantity", "Websites", "Manufacturer", "size"];

  // Function to clear magento workflow state from localStorage
  const clearMagentoWorkflowState = () => {
    const keysToRemove = [
      'magento_sku',
      'magento_message',
      'magento_spreadsheetMatch',
      'magento_showManualRef',
      'magento_manualRef',
      'magento_pendingSku',
      'magento_descriptionResult',
      'magento_qcFlaw',
      'magento_price',
      'magento_totalPrice',
      'magento_requireSerial',
      'magento_serialNumber',
      'magento_selectedMachine',
      'magento_showNewProductForm',
      'magento_newProduct',
      'magento_scannedItems',
      'magento_quantity'
    ];
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });
  };

  // Undo last action function - handles both scanned items and workflow states
  const handleUndoLastScan = async () => {
    try {
      // First check if there are local workflow states to undo (like manual ref or new product forms)
      if (showNewProductForm) {
        // Undo new product form - go back to manual reference
        setMessage("Cancelled new product form, returning to manual reference");
        setShowNewProductForm(false);
        setNewProduct({
          name: "",
          refNum: "",
          price: "",
          quantity: "",
          manufacturer: "",
          size: "",
        });
        return;
      }
      
      if (showManualRef) {
        // Undo manual reference form - clear everything and return to main scan
        setMessage("Cancelled manual reference entry");
        setShowManualRef(false);
        setManualRef("");
        setPendingSku("");
        setSku("");
        setQcFlaw("none");
        setSerialNumber("");
        setQuantity(1);
        if (skuInputRef.current) {
          skuInputRef.current.focus();
        }
        return;
      }

      // If no local workflow states, call backend undo for scanned items
      const res = await axios.post(`${apiUrl}/api/magento-inventory/undo`, {
        sessionId,
      });

      setMessage(res.data.message || "Last scan undone successfully");
      
      // Update the local state based on the undo response
      if (res.data.undoneItem && scannedItems.length > 0) {
        const lastItem = scannedItems[scannedItems.length - 1];
        
        // Always decrement quantity by 1, remove item only if quantity becomes 0
        if (lastItem.quantity > 1) {
          // Decrement quantity of the last item
          setScannedItems((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              quantity: updated[updated.length - 1].quantity - 1
            };
            return updated;
          });
        } else {
          // Remove the last item if quantity is 1 (becomes 0)
          setScannedItems((prev) => prev.slice(0, -1));
        }
        
        // Update total price (subtract the price of 1 item)
        if (res.data.newTotalPrice !== undefined) {
          setTotalPrice(res.data.newTotalPrice);
        } else if (res.data.undoneItem.price) {
          setTotalPrice((prev) => Math.max(0, prev - res.data.undoneItem.price));
        }
      }

      // Clear pending states if undo cleared them
      if (res.data.action === "clearPendingState") {
        setShowManualRef(false);
        setShowNewProductForm(false);
        setPendingSku("");
        setManualRef("");
        setSku("");
      }

      // Refresh the magento data to show updated inventory
      refreshMagentoData();
      
      console.log(`[Magento Inventory] Undo completed:`, res.data);
    } catch (error) {
      setMessage(`Undo failed: ${error.response?.data?.error || error.message}`);
      console.error("Error undoing last scan:", error);
    }
  };

  return (
    <div className="min-h-screen bg-base-200 flex">
      <div className="w-1/3 bg-base-100 shadow-xl p-6">
        <div className="card-body">
          <h1 className="card-title text-3xl mb-6 text-primary">
            Magento Inventory
          </h1>
          
          <SkuForm
            sku={sku}
            setSku={setSku}
            handleSkuSubmit={handleSkuSubmit}
            setSkuInputAndFocus={(el) => { skuInputRef.current = el; }}
            showManualRef={showManualRef}
            qcFlaw={qcFlaw}
            setQcFlaw={setQcFlaw}
            quantity={quantity}
            setQuantity={setQuantity}
            onManualEntry={() => {
              if (!sku.trim()) {
                setMessage("Please enter a UPC before using manual entry.");
                return;
              }
              setShowManualRef(true);
              setPendingSku(sku);
              setMessage("Enter manual reference for the item:");
            }}
            onNoBarcodeEntry={() => {
              setShowManualRef(true);
              setPendingSku("NO_BARCODE");
              setSku("");
              setMessage("No barcode available. Enter manual reference:");
            }}
          />

          {showManualRef && (
            <ManualRefForm
              manualRef={manualRef}
              setManualRef={setManualRef}
              handleManualRefSubmit={handleManualRefSubmit}
              manualRefInputRef={manualRefInputRef}
            />
          )}

          {showNewProductForm && (
            <form onSubmit={handleNewProductSubmit} className="mb-6">
              <h3 className="text-lg font-bold mb-4">Add New Magento Product</h3>
              <input
                type="text"
                placeholder="Name"
                className="input input-bordered w-full mb-2"
                value={newProduct.name}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, name: e.target.value })
                }
                required
              />
              <input
                type="text"
                placeholder="Reference Number"
                className="input input-bordered w-full mb-2"
                value={newProduct.refNum}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, refNum: e.target.value })
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
                type="number"
                placeholder="Quantity"
                className="input input-bordered w-full mb-2"
                value={newProduct.quantity}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, quantity: e.target.value })
                }
              />
              <input
                type="text"
                placeholder="Manufacturer"
                className="input input-bordered w-full mb-2"
                value={newProduct.manufacturer}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, manufacturer: e.target.value })
                }
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
              <h3 className="font-bold mb-2">Scanned Items:</h3>
              <div className="max-h-32 overflow-y-auto">
                {scannedItems.map((item, index) => (
                  <div key={index} className="text-sm mb-1">
                    <div className="font-medium">{item.description}</div>
                    <div className="text-xs opacity-70">
                      UPC: {item.sku || "N/A"} | Price: ${item.price?.toFixed(2) || "0.00"}
                      {item.quantity && item.quantity > 1 ? ` | Qty: ${item.quantity} | Total: $${(item.price * item.quantity).toFixed(2)}` : ""}
                    </div>
                  </div>
                ))}
              </div>
              <div className="font-bold mt-2">
                Total: ${scannedItems.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0).toFixed(2)}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleUndoLastScan}
                  className="btn btn-warning flex-1"
                  disabled={scannedItems.length === 0 && !showManualRef && !showNewProductForm}
                >
                  ↶ Undo Last Action
                </button>
                <button
                  onClick={handleFinishMagento}
                  className="btn btn-success flex-1"
                >
                  Finish Magento Inventory
                </button>
              </div>
            </div>
          )}

          {/* Show undo button for any undoable workflow state */}
          {(scannedItems.length === 0 && (showManualRef || showNewProductForm)) && (
            <div className="mb-4">
              <button
                onClick={handleUndoLastScan}
                className="btn btn-warning w-full"
              >
                ↶ Undo Last Action
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

      <div className="flex-1 p-6 flex flex-col">
        <div className="card bg-base-100 shadow-xl flex-1 flex flex-col mr-6">
          <div className="card-body flex-1 flex flex-col">
            <h2 className="card-title text-2xl mb-4">Magento Inventory Data</h2>
            <div className="mb-4 flex gap-4 flex-wrap">
              <button
                onClick={handleExportCSV}
                className="btn btn-outline btn-primary flex-1 min-w-0"
                disabled={magentoInventoryData.length === 0}
              >
                📊 Export CSV
              </button>
              <button
                onClick={refreshMagentoData}
                className="btn btn-outline btn-secondary flex-1 min-w-0"
              >
                🔄 Refresh Data
              </button>
            </div>
            <div className="flex-1 overflow-auto border border-base-content rounded-lg">
              {magentoInventoryData.length > 0 ? (
                <table className="table table-xs w-full">
                  <thead className="sticky top-0 bg-base-200">
                    <tr>
                      {fieldOrder.map((field) => (
                        <th key={field} className="border border-base-content border-solid px-2 py-1 text-xs">
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {magentoInventoryData.map((row, i) => (
                      <tr key={i} className="hover:bg-base-100">
                        {fieldOrder.map((field) => (
                          <td key={field} className="border border-base-content border-solid px-2 py-1 text-xs break-words">
                            {field === 'Price' && row[field] 
                              ? `$${parseFloat(row[field]).toFixed(2)}`
                              : row[field] || ""
                            }
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-center text-base-content/60">No Magento inventory data available.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MagentoInventory;
