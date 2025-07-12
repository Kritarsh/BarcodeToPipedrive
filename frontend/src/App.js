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
  const [requireSerial, setRequireSerial] = useState(false);  const [serialNumber, setSerialNumber] = useState("");
  const [selectedMachine, setSelectedMachine] = useState("");
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [newProduct, setNewProduct] = useState({
    barcode: "",
    description: "",
    size: "",
    price: "",
    qcFlaw: "none",
    manualRef: "", // <-- change from serialNumber to manualRef
  });  const skuInputRef = useRef(null);
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
    if (el && !showManualRef) el.focus();
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
    if (dealFound) {
      setTimeout(() => {
        if (skuInputRef.current) skuInputRef.current.focus();
      }, 0);
    }
  }, [dealFound, sku]);
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
          serialNumber: sku, // sku field is used for serial number here
        });
        setSpreadsheetMatch(res.data.spreadsheetMatch);
        setMessage("Machine added and note attached!");
        setPrice(res.data.price);
        if (qcFlaw !== "flaw" && !isNaN(res.data.price)) {
          setTotalPrice((prev) => prev + res.data.price);
        }
        setSelectedMachine("");
        setSku("");
        setQcFlaw("none"); // <-- Add this line
        return;
      }

      // Normal UPC flow
      const res = await axios.post(`${apiUrl}/api/barcode`, {
        scanType: "sku",
        barcode: sku,
        sessionId,
        qcFlaw,
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
      }
      setSku("");
      setPrice(res.data.price);

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
        serialNumber,
        qcFlaw,
      });
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
      setDescriptionResult(retryRes.data.descriptionResult);
      setPrice(retryRes.data.price);
      if (qcFlaw !== "flaw" && !isNaN(retryRes.data.price)) {
        setTotalPrice((prev) => prev + retryRes.data.price);
      }
      setQcFlaw("none"); // <-- Add this line
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
        serialNumber,
        qcFlaw,
      });
    }
  };

  const handleNewProductSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${apiUrl}/api/product/new`, {
        ...newProduct,
        sessionId,
      });
      setMessage("Product added!");
      setShowNewProductForm(false);
      setPrice(Number(newProduct.price));
      setTotalPrice((prev) => prev + Number(newProduct.price));
      setNewProduct({
        barcode: "",
        description: "",
        size: "",
        price: "",
        qcFlaw: "none",
        manualRef: "", // <-- change from serialNumber to manualRef
      });
      setQcFlaw("none"); // <-- Add this line
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
      setMessage("Undoing last scan...");
      const res = await axios.post(`${apiUrl}/api/barcode/undo`, {
        sessionId
      });
      
      // Update the total price by subtracting the undone item's price
      const undonePriceValue = Number(res.data.undoneItem.price) || 0;
      if (res.data.undoneItem.qcFlaw !== "flaw") {
        setTotalPrice(prev => Math.max(0, prev - undonePriceValue));
      }
      
      setMessage(`Undone: ${res.data.undoneItem.description} (${res.data.remainingItems} items remaining)`);
      
      // Clear any current form state
      setSku("");
      setShowManualRef(false);
      setManualRef("");
      setPendingSku("");
      setPrice(null);
      setDescriptionResult("");
      
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
