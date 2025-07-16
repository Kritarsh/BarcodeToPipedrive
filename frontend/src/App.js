import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import TrackingForm from "./TrackingForm";
import SkuForm from "./SkuForm";
import ManualRefForm from "./ManualRefForm";
const apiUrl = process.env.REACT_APP_API_URL;

function App() {
  const [sessionId] = useState(() => Math.random().toString(36).substr(2, 9));
  const [trackingNumber, setTrackingNumber] = useState("");
  const [sku, setSku] = useState("");
  const [dealFound, setDealFound] = useState(false);
  const [message, setMessage] = useState("");
  const [spreadsheetMatch, setSpreadsheetMatch] = useState(null);
  const [showManualRef, setShowManualRef] = useState(false);
  const [manualRef, setManualRef] = useState("");
  const [pendingSku, setPendingSku] = useState("");
  const [descriptionResult, setDescriptionResult] = useState("");
  const [qcFlaw, setQcFlaw] = useState("none");
  const [price, setPrice] = useState(null);
  const [totalPrice, setTotalPrice] = useState(0);
  const [quantity, setQuantity] = useState(1);
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
    manualRef: "", // <-- change from serialNumber to manualRef
    mfr: "",
  });
  const [scannedItems, setScannedItems] = useState([]);
  const skuInputRef = useRef(null);
  const trackingInputRef = useRef(null);
  const manualRefInputRef = useRef(null);

  // New MongoDB data states
  const [inventoryData, setInventoryData] = useState([]);
  const [overstockData, setOverstockData] = useState([]);
  const [machineSpecificsData, setMachineSpecificsData] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState("inventory");

  const cpapMachines = [
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
    "CoughAssist T70",
    "Oxygen Concentrator",
  ];

  const setSkuInputAndFocus = (el) => {
    skuInputRef.current = el;
    if (el && !showManualRef && !showNewProductForm && document.activeElement?.type !== 'number') {
      el.focus();
    }
  };

  // Fetch MongoDB data
  useEffect(() => {
    axios
      .get(`${apiUrl}/api/inventory`)
      .then((res) => setInventoryData(res.data.data))
      .catch(() => setInventoryData([]));
    axios
      .get(`${apiUrl}/api/overstock`)
     .then((res) => setOverstockData(res.data.data))
      .catch(() => setOverstockData([]));
    axios
      .get(`${apiUrl}/api/machine-specifics`)
      .then((res) => setMachineSpecificsData(res.data.data))
      .catch(() => setMachineSpecificsData([]));
  }, []);

  useEffect(() => {
    if (!dealFound && trackingInputRef.current) {
      trackingInputRef.current.focus();
    }
  }, [dealFound]);
  useEffect(() => {
    if (dealFound && !showManualRef && !showNewProductForm) {
      setTimeout(() => {
        if (skuInputRef.current) skuInputRef.current.focus();
      }, 0);
    }
  }, [dealFound, showManualRef, showNewProductForm]);
  useEffect(() => {
    if (showManualRef && manualRefInputRef.current) {
      manualRefInputRef.current.focus();
    }
  }, [showManualRef]);

  const handleTrackingSubmit = async (e) => {
    e.preventDefault();
    setMessage("Searching for Tracking Number...");
    try {
      const res = await axios.post(`${apiUrl}/api/barcode`, {
        scanType: "tracking",
        barcode: trackingNumber,
        sessionId,
      });
      setDealFound(true);
      setMessage("Tracking Number found! Now scan SKU.");
    } catch (err) {
      // If not found, try again with first 8 characters removed
      if (
        trackingNumber.length > 8 &&
        (!err.response || err.response.status === 404)
      ) {
        const trimmedTracking = trackingNumber.slice(8);
        setMessage("Retrying with trimmed tracking number...");
        try {
          const res = await axios.post(`${apiUrl}/api/barcode`, {
            scanType: "tracking",
            barcode: trimmedTracking,
            sessionId,
          });
          setDealFound(true);
          setTrackingNumber(trimmedTracking); // update state to reflect the trimmed value
          setMessage("Tracking Number found after retry! Now scan SKU.");
          return;
        } catch (retryErr) {
          setMessage(
            retryErr.response?.data?.error ||
              "Deal not found, even after retrying."
          );
          return;
        }
      }
      setMessage(err.response?.data?.error || "Deal not found.");
    }
  };

  const handleSkuSubmit = async (e) => {
    e.preventDefault();
    setMessage(selectedMachine ? "Adding machine..." : "Checking SKU...");
    setShowManualRef(false);
    setManualRef("");
    setPrice(null);

    try {
      if (selectedMachine) {
        // Send machine and serial number
        const res = await axios.post(`${apiUrl}/api/barcode`, {
          scanType: "sku",
          barcode: selectedMachine,
          sessionId,
          qcFlaw,
          quantity,
          serialNumber: sku, // sku field is used for serial number here
        });
        setSpreadsheetMatch(res.data.spreadsheetMatch);
        setMessage("Machine added and note attached!");
        setPrice(res.data.price);
        if (qcFlaw !== "flaw" && !isNaN(res.data.price)) {
          setTotalPrice((prev) => prev + (res.data.price * quantity));
        }
        
        // Add to scannedItems
        setScannedItems((prev) => [...prev, {
          upc: selectedMachine,
          description: selectedMachine,
          price: res.data.price,
          qcFlaw: qcFlaw,
          serialNumber: sku, // sku field is used for serial number here
          quantity: quantity,
          isMachine: true
        }]);
        
        setSelectedMachine("");
        setSku("");
        setQuantity(1);
        setQcFlaw("none"); // <-- Add this line
        return;
      }

      // Normal UPC flow
      const res = await axios.post(`${apiUrl}/api/barcode`, {
        scanType: "sku",
        barcode: sku,
        sessionId,
        qcFlaw,
        quantity,
      });
      const nameForSerialCheck =
        (res.data.row &&
          (res.data.row.Name ||
            res.data.row.Description ||
            res.data.row.Style)) ||
        (res.data.descriptionResult &&
          res.data.descriptionResult.description) ||
        "";

      setSpreadsheetMatch(res.data.spreadsheetMatch);
      setMessage(
        res.data.spreadsheetMatch
          ? "SKU found and note added!"
          : "SKU not found"
      );

      // ADD THIS LINE - Set description result for display
      setDescriptionResult(res.data.descriptionResult || "");

      if (
        cpapMachines.some((keyword) =>
          (nameForSerialCheck || "")
            .toLowerCase()
            .includes(keyword.toLowerCase())
        )
      ) {
        setRequireSerial(true);
        setPendingSku(sku);
        setSku("");
        return;
      }

      if (!res.data.spreadsheetMatch) {
        setShowManualRef(true);
        setPendingSku(sku);
        // Focus on manual reference input after a short delay to ensure DOM is updated
        setTimeout(() => {
          if (manualRefInputRef.current) {
            manualRefInputRef.current.focus();
          }
        }, 0);
      } else {
        // Add to scannedItems for successful UPC scans
        setScannedItems((prev) => [...prev, {
          upc: sku,
          description: res.data.row?.Description || res.data.row?.Name || res.data.row?.Style || sku,
          price: res.data.price,
          qcFlaw: qcFlaw,
          serialNumber: serialNumber,
          quantity: quantity
        }]);
        
        // Only reset quantity if the scan was successful
        setQuantity(1);
      }
      setSku("");
      setPrice(res.data.price);

      if (qcFlaw !== "flaw" && !isNaN(res.data.price)) {
        setTotalPrice((prev) => prev + (res.data.price * quantity));
      }
    } catch (err) {
      setMessage(err.response?.data?.error || "Error checking SKU.");
    }
  };

  const handleManualRefSubmit = async (e) => {
    e.preventDefault();
    setMessage("Checking manual reference...");
    setDescriptionResult("");
    let description = "";
    const selectedRows = inventoryData;
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
        price,
        quantity,
        serialNumber,
        qcFlaw,
      });
      
      // Check if the manual reference was successful
      if (retryRes.data.match === false) {
        // Manual reference failed, show new product form
        setMessage("SKU not found even with the manual reference.");
        setShowNewProductForm(true);
        setNewProduct({
          ...newProduct,
          barcode: pendingSku,
          manualRef: manualRef,
          qcFlaw,
        });
        return;
      }
      
      // Add to scannedItems for successful manual reference
      setScannedItems((prev) => [...prev, {
        upc: pendingSku,
        description: retryRes.data.descriptionResult?.description || pendingSku,
        price: retryRes.data.price,
        qcFlaw: qcFlaw,
        serialNumber: serialNumber,
        quantity: quantity,
        manualRef: manualRef
      }]);
      
      setSpreadsheetMatch(retryRes.data.spreadsheetMatch);
      setMessage(
        retryRes.data.spreadsheetMatch
          ? "SKU found and note added!"
          : retryRes.data.descriptionMatch
          ? "SKU not found by manual reference, but found by description!"
          : "SKU not found even with the manual reference."
      );
      setShowManualRef(false);
      setManualRef("");
      setPendingSku("");
      setQuantity(1);
      setDescriptionResult(retryRes.data.descriptionResult);
      setPrice(retryRes.data.price);
      if (qcFlaw !== "flaw" && !isNaN(retryRes.data.price)) {
        setTotalPrice((prev) => prev + (retryRes.data.price * quantity));
      }
      setQcFlaw("none"); // <-- Add this line
      setSerialNumber(""); // Clear serial number
      setTimeout(() => {
        if (skuInputRef.current) {
          skuInputRef.current.focus();
        }
      }, 0);
    } catch (err) {
      setMessage(
        err.response?.data?.error || "Error checking manual reference."
      );
      setShowNewProductForm(true);
      setNewProduct({
        ...newProduct,
        barcode: pendingSku,
        manualRef: manualRef,
        qcFlaw,
      });
    }
  };

  const handleNewProductSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${apiUrl}/api/product/new`, {
        ...newProduct,
        quantity,
        sessionId,
      });
      setMessage(res.data.message || "Product added to inventory and month end collections!");
      setShowNewProductForm(false);
      setQuantity(1);
      setPrice(res.data.price || Number(newProduct.price));
      setTotalPrice((prev) => prev + ((res.data.price || Number(newProduct.price)) * quantity));
      
      // Add to scannedItems
      setScannedItems((prev) => [...prev, {
        upc: newProduct.barcode,
        description: newProduct.description,
        price: res.data.price || Number(newProduct.price),
        qcFlaw: newProduct.qcFlaw,
        serialNumber: serialNumber,
        quantity: quantity,
        manualRef: newProduct.manualRef,
        isNewProduct: true
      }]);
      
      setNewProduct({
        barcode: "",
        description: "",
        size: "",
        price: "",
        qcFlaw: "none",
        manualRef: "", // <-- change from serialNumber to manualRef
        mfr: "",
      });
      setQcFlaw("none"); // <-- Add this line
      setSerialNumber(""); // Clear serial number
      setShowManualRef(false); // Clear manual ref form
      setManualRef(""); // Clear manual ref
      setPendingSku(""); // Clear pending SKU
    } catch (err) {
      setMessage(err.response?.data?.error || "Failed to add new product.");
    }
  };

  // Add undo function
  const handleUndo = async () => {
    if (!dealFound) {
      setMessage("No active session to undo from");
      return;
    }

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
        if (res.data.undoneItem.qcFlaw !== "flaw") {
          setTotalPrice(prev => Math.max(0, prev - (undonePriceValue * undoneQuantity)));
        }
        
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
      
    } catch (err) {
      setMessage(err.response?.data?.error || "Failed to undo last scan");
    }
  };

  // Table data selection
  let tableData = [];
  if (selectedCollection === "inventory") tableData = inventoryData;
  else if (selectedCollection === "overstock") tableData = overstockData;
  else if (selectedCollection === "machineSpecifics")
    tableData = machineSpecificsData;

  const fieldOrders = {
    inventory: ["RefNum", "UPC", "MFR", "Style", "Size", "Quantity", "Date"],
    overstock: ["RefNum", "UPC", "MFR", "Style", "Size", "Quantity", "Date"],
    machineSpecifics: ["Name", "UPC", "SerialNumber", "Quantity", "Date"], // adjust as needed
  };
  const currentFieldOrder = fieldOrders[selectedCollection] || [];

  return (
    <div className="min-h-screen w-full bg-base-200 flex">
      <div className="bg-base-100 shadow-xl w-[30%] p-6">
        <div className="card-body">
          <h1 className="card-title text-3xl justify mb-6 text-primary">
            Barcode to Pipedrive
          </h1>
          <TrackingForm
            trackingNumber={trackingNumber}
            setTrackingNumber={setTrackingNumber}
            dealFound={dealFound}
            trackingInputRef={trackingInputRef}
            onSubmit={handleTrackingSubmit}
          />
          {dealFound && (
            <>
              {/* CPAP Machine Dropdown */}
              <div className="mb-4">
                <label className="block mb-2 font-medium text-base-content">
                  Or select a CPAP machine:
                  <select
                    className="select select-bordered w-full mt-1"
                    value={selectedMachine}
                    onChange={async (e) => {
                      const machine = e.target.value;
                      setSelectedMachine(machine);
                      setSku(""); // clear the input for serial number entry
                    }}
                  >
                    <option value="">-- Select a machine --</option>
                    {cpapMachines.map((machine) => (
                      <option key={machine} value={machine}>
                        {machine}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <SkuForm
                sku={sku}
                setSku={setSku}
                handleSkuSubmit={handleSkuSubmit}
                setSkuInputAndFocus={setSkuInputAndFocus}
                showManualRef={showManualRef}
                qcFlaw={qcFlaw}
                setQcFlaw={setQcFlaw}
                quantity={quantity}
                setQuantity={setQuantity}
              />              {showManualRef && (
                <ManualRefForm
                  manualRef={manualRef}
                  setManualRef={setManualRef}
                  handleManualRefSubmit={handleManualRefSubmit}
                  manualRefInputRef={manualRefInputRef}
                />              )}
              
              {/* Add the Undo Button */}
              <button
                className="btn btn-warning w-full mb-4"
                onClick={handleUndo}
              >
                ↶ Undo Last Scan
              </button>
              
              <button
                className="btn btn-secondary w-full mb-4"
                onClick={async () => {
                  if (trackingNumber) {
                    try {
                      await axios.post(`${apiUrl}/api/barcode`, {
                        scanType: "tracking",
                        barcode: trackingNumber,
                        sessionId,
                      });
                    } catch (err) {
                      setMessage("Failed to finalize previous tracking batch.");
                    }
                  }
                  setDealFound(false);
                  setTrackingNumber("");
                  setSku("");
                  setQuantity(1);
                  setShowManualRef(false);
                  setManualRef("");
                  setPendingSku("");
                  setMessage("");
                  setSpreadsheetMatch(null);
                  setDescriptionResult("");
                  setPrice(null);
                  setTotalPrice(0);
                  setScannedItems([]);
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
            <div className="text-center text-sm text-base-content">
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
          
          {/* Scanned Items Summary */}
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
                    {item.isMachine && item.serialNumber ? ` Serial: ${item.serialNumber}` : ""}
                    {item.manualRef ? ` Ref: ${item.manualRef}` : ""}
                    {item.isNewProduct ? " (New)" : ""}
                    {item.qcFlaw && item.qcFlaw !== "none" ? ` [${item.qcFlaw}]` : ""}
                    - ${item.price}
                    {item.quantity && item.quantity > 1 ? ` (Total: $${(item.price * item.quantity).toFixed(2)})` : ""}
                  </div>
                ))}
              </div>
              <div className="font-bold mt-2">
                Total: ${scannedItems.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0).toFixed(2)}
              </div>
            </div>
          )}
          
          {/* Month End Inventory Link */}
          <div className="mt-4">
            <a 
              href="/month-end-inventory" 
              className="btn btn-outline btn-secondary w-full"
            >
              📊 Month End Inventory
            </a>
          </div>
        </div>
      </div>
      <div className="bg-base-100 rounded-xl shadow-lg p-6 w-[70%]">
        <h2 className="text-2xl font-bold mb-4">Data Viewer</h2>
        <div className="mb-4">
          <label className="font-semibold mr-2">Select data:</label>
          <select
            className="select select-bordered"
            value={selectedCollection}
            onChange={(e) => setSelectedCollection(e.target.value)}
          >
            <option value="inventory">Inventory</option>
            <option value="overstock">Overstock</option>
            <option value="machineSpecifics">Machine Specifics</option>
          </select>
        </div>
        <div className="overflow-x-auto max-h-[70vh]">
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
                      {row[field] !== undefined ? row[field] : "N/A"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {tableData.length === 0 && (
            <div className="text-base-content opacity-60 text-center mt-4">
              No data to display.
            </div>
          )}
        </div>
        {showNewProductForm && (
          <form
            onSubmit={handleNewProductSubmit}
            className="mb-4 p-4 bg-base-200 rounded"
          >
            <h3 className="mb-2 font-bold">Add New Product</h3>
            <input
              className="input input-bordered w-full mb-2"
              placeholder="Barcode"
              value={newProduct.barcode}
              onChange={(e) =>
                setNewProduct({ ...newProduct, barcode: e.target.value })
              }
              required
            />
            <input
              className="input input-bordered w-full mb-2"
              placeholder="Description"
              value={newProduct.description}
              onChange={(e) =>
                setNewProduct({ ...newProduct, description: e.target.value })
              }
              required
            />
            <input
              className="input input-bordered w-full mb-2"
              placeholder="Size"
              value={newProduct.size}
              onChange={(e) =>
                setNewProduct({ ...newProduct, size: e.target.value })
              }
            />
            <input
              className="input input-bordered w-full mb-2"
              placeholder="Price"
              type="number"
              value={newProduct.price}
              onChange={(e) =>
                setNewProduct({ ...newProduct, price: e.target.value })
              }
              required
            />
            <input
              className="input input-bordered w-full mb-2"
              placeholder="Manual Reference Number"
              value={newProduct.manualRef}
              onChange={(e) =>
                setNewProduct({ ...newProduct, manualRef: e.target.value })
              }
            />
            <input
              className="input input-bordered w-full mb-2"
              placeholder="Manufacturer"
              value={newProduct.mfr}
              onChange={(e) =>
                setNewProduct({ ...newProduct, mfr: e.target.value })
              }
            />
            <select
              className="select select-bordered w-full mb-2"
              value={newProduct.qcFlaw}
              onChange={(e) =>
                setNewProduct({ ...newProduct, qcFlaw: e.target.value })
              }
            >
              <option value="none">No Flaw</option>
              <option value="flaw">Missing Part</option>
              <option value="damaged">Damaged</option>
              <option value="donotaccept">Do Not Accept</option>
              <option value="tornpackaging">Torn Packaging</option>
              <option value="other">Not in Original Packaging</option>
              <option value="yellow">Yellow</option> 
            </select>
            <button className="btn btn-primary w-full" type="submit">
              Add Product
            </button>
          </form>
        )}
      </div>
    </div>
  );
}



export default App;
