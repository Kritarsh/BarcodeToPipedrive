import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import TrackingForm from "./TrackingForm";
import SkuForm from "./SkuForm";
import ManualRefForm from "./ManualRefForm";
const apiUrl = process.env.REACT_APP_API_URL;

function App() {
  const [sessionId] = useState(() => Math.random().toString(36).substr(2, 9));
  // Load workflow state from localStorage or use default values
  const [trackingNumber, setTrackingNumber] = useState(() => localStorage.getItem('pipedrive_trackingNumber') || '');
  const [sku, setSku] = useState(() => localStorage.getItem('pipedrive_sku') || '');
  const [dealFound, setDealFound] = useState(() => localStorage.getItem('pipedrive_dealFound') === 'true');
  const [message, setMessage] = useState(() => localStorage.getItem('pipedrive_message') || '');
  const [spreadsheetMatch, setSpreadsheetMatch] = useState(() => {
    const saved = localStorage.getItem('pipedrive_spreadsheetMatch');
    return saved && saved !== 'undefined' ? JSON.parse(saved) : null;
  });
  const [showManualRef, setShowManualRef] = useState(() => localStorage.getItem('pipedrive_showManualRef') === 'true');
  const [manualRef, setManualRef] = useState(() => localStorage.getItem('pipedrive_manualRef') || '');
  const [pendingSku, setPendingSku] = useState(() => localStorage.getItem('pipedrive_pendingSku') || '');
  const [descriptionResult, setDescriptionResult] = useState(() => localStorage.getItem('pipedrive_descriptionResult') || '');
  const [qcFlaw, setQcFlaw] = useState(() => localStorage.getItem('pipedrive_qcFlaw') || 'none');
  const [price, setPrice] = useState(() => {
    const saved = localStorage.getItem('pipedrive_price');
    return saved && saved !== 'undefined' ? JSON.parse(saved) : null;
  });
  const [totalPrice, setTotalPrice] = useState(() => {
    const saved = localStorage.getItem('pipedrive_totalPrice');
    return saved && saved !== 'undefined' ? parseFloat(saved) : 0;
  });
  const [quantity, setQuantity] = useState(() => {
    const saved = localStorage.getItem('pipedrive_quantity');
    return saved && saved !== 'undefined' ? parseInt(saved) : 1;
  });
  const [requireSerial, setRequireSerial] = useState(() => localStorage.getItem('pipedrive_requireSerial') === 'true');
  const [serialNumber, setSerialNumber] = useState(() => localStorage.getItem('pipedrive_serialNumber') || '');
  const [selectedMachine, setSelectedMachine] = useState(() => localStorage.getItem('pipedrive_selectedMachine') || '');
  const [showNewProductForm, setShowNewProductForm] = useState(() => localStorage.getItem('pipedrive_showNewProductForm') === 'true');
  const [newProduct, setNewProduct] = useState(() => {
    const saved = localStorage.getItem('pipedrive_newProduct');
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
    const saved = localStorage.getItem('pipedrive_scannedItems');
    return saved && saved !== 'undefined' ? JSON.parse(saved) : [];
  });
  const skuInputRef = useRef(null);
  const trackingInputRef = useRef(null);
  const manualRefInputRef = useRef(null);

  // New MongoDB data states
  const [inventoryData, setInventoryData] = useState([]);
  const [overstockData, setOverstockData] = useState([]);
  const [machineSpecificsData, setMachineSpecificsData] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState("inventory");

  // Computed variables for table display
  const tableData = selectedCollection === "inventory" ? inventoryData : 
                   selectedCollection === "overstock" ? overstockData : 
                   machineSpecificsData;

  const currentFieldOrder = tableData.length > 0 ? Object.keys(tableData[0]) : [];

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

  // Initialize dealFound state and restore backend session
  useEffect(() => {
    if (trackingNumber && !dealFound) {
      setDealFound(true);
      // Only set the message if there isn't already a meaningful message
      if (!message || message === '') {
        setMessage("Tracking Number loaded from previous session! Now scan SKU.");
      }
      
      // Restore backend session if we have scanned items
      if (scannedItems.length > 0) {
        restoreBackendSession();
      }
    }
  }, []); // Only run on mount

  // Function to restore backend session from localStorage data
  const restoreBackendSession = async () => {
    try {
      setMessage("Restoring session...");
      await axios.post(`${apiUrl}/api/session/restore`, {
        sessionId,
        trackingNumber,
        scannedItems,
        totalPrice
      });
      setMessage("Session restored! Ready to continue scanning or submit to Pipedrive.");
    } catch (error) {
      console.error("Failed to restore backend session:", error);
      setMessage("Warning: Session could not be fully restored. You may need to re-enter tracking number.");
      // Don't reset dealFound here as the frontend state is still valid
    }
  };

  // Save workflow state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('pipedrive_trackingNumber', trackingNumber);
  }, [trackingNumber]);

  useEffect(() => {
    localStorage.setItem('pipedrive_sku', sku);
  }, [sku]);

  useEffect(() => {
    localStorage.setItem('pipedrive_dealFound', dealFound.toString());
  }, [dealFound]);

  useEffect(() => {
    localStorage.setItem('pipedrive_message', message);
  }, [message]);

  useEffect(() => {
    localStorage.setItem('pipedrive_spreadsheetMatch', JSON.stringify(spreadsheetMatch));
  }, [spreadsheetMatch]);

  useEffect(() => {
    localStorage.setItem('pipedrive_showManualRef', showManualRef.toString());
  }, [showManualRef]);

  useEffect(() => {
    localStorage.setItem('pipedrive_manualRef', manualRef);
  }, [manualRef]);

  useEffect(() => {
    localStorage.setItem('pipedrive_pendingSku', pendingSku);
  }, [pendingSku]);

  useEffect(() => {
    localStorage.setItem('pipedrive_descriptionResult', descriptionResult);
  }, [descriptionResult]);

  useEffect(() => {
    localStorage.setItem('pipedrive_qcFlaw', qcFlaw);
  }, [qcFlaw]);

  useEffect(() => {
    localStorage.setItem('pipedrive_price', JSON.stringify(price));
  }, [price]);

  useEffect(() => {
    localStorage.setItem('pipedrive_totalPrice', totalPrice.toString());
  }, [totalPrice]);

  useEffect(() => {
    localStorage.setItem('pipedrive_quantity', quantity.toString());
  }, [quantity]);

  useEffect(() => {
    localStorage.setItem('pipedrive_requireSerial', requireSerial.toString());
  }, [requireSerial]);

  useEffect(() => {
    localStorage.setItem('pipedrive_serialNumber', serialNumber);
  }, [serialNumber]);

  useEffect(() => {
    localStorage.setItem('pipedrive_selectedMachine', selectedMachine);
  }, [selectedMachine]);

  useEffect(() => {
    localStorage.setItem('pipedrive_showNewProductForm', showNewProductForm.toString());
  }, [showNewProductForm]);

  useEffect(() => {
    localStorage.setItem('pipedrive_newProduct', JSON.stringify(newProduct));
  }, [newProduct]);

  useEffect(() => {
    localStorage.setItem('pipedrive_scannedItems', JSON.stringify(scannedItems));
  }, [scannedItems]);

  // Function to clear workflow state from localStorage
  const clearWorkflowState = () => {
    const keysToRemove = [
      'pipedrive_trackingNumber',
      'pipedrive_sku',
      'pipedrive_dealFound',
      'pipedrive_message',
      'pipedrive_spreadsheetMatch',
      'pipedrive_showManualRef',
      'pipedrive_manualRef',
      'pipedrive_pendingSku',
      'pipedrive_descriptionResult',
      'pipedrive_qcFlaw',
      'pipedrive_price',
      'pipedrive_totalPrice',
      'pipedrive_quantity',
      'pipedrive_requireSerial',
      'pipedrive_serialNumber',
      'pipedrive_selectedMachine',
      'pipedrive_showNewProductForm',
      'pipedrive_newProduct',
      'pipedrive_scannedItems'
    ];
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });
  };

  // Handler functions for the workflow
  const handleTrackingSubmit = async (e) => {
    e.preventDefault();
    setMessage("Searching for Tracking Number...");
    
    // If there are existing scanned items, restore session first to submit them to Pipedrive
    if (scannedItems.length > 0 && trackingNumber) {
      try {
        setMessage("Finalizing previous batch and submitting to Pipedrive...");
        
        // First restore the session to ensure backend has the data
        await axios.post(`${apiUrl}/api/session/restore`, {
          sessionId,
          trackingNumber,
          scannedItems,
          totalPrice
        });
        
        setMessage("Previous batch submitted to Pipedrive. Searching for new tracking number...");
      } catch (err) {
        console.error("Failed to restore session for previous batch:", err);
        setMessage("Warning: Previous batch may not have been submitted. Continuing with new tracking number...");
      }
    }
    
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
    setPendingSku("");
    setDescriptionResult("");
    setPrice(null);
    setShowNewProductForm(false);
    setNewProduct({
      barcode: "",
      description: "",
      size: "",
      price: "",
      qcFlaw: "none",
      manualRef: "",
      mfr: "",
    });

    try {
      const res = await axios.post(`${apiUrl}/api/barcode`, {
        scanType: "sku",
        barcode: sku, // Always use the UPC field value (which contains the serial number for machines)
        sessionId,
        qcFlaw,
        serialNumber,
        quantity,
        machineType: selectedMachine, // Pass the machine type separately
      });

      // Check if the response indicates no match
      if (res.data.match === false) {
        console.log("No match found, showing manual reference form");
        setMessage(res.data.message || "SKU not found in spreadsheet.");
        setShowManualRef(true);
        setPendingSku(sku); // Always use the UPC field value
        return;
      }

      setMessage(res.data.message || "Success!");
      setPrice(res.data.price);
      setTotalPrice(totalPrice + (res.data.price || 0) * quantity);
      setSpreadsheetMatch(res.data.spreadsheetMatch);
      setDescriptionResult(res.data.descriptionResult);

      // Add to scanned items
      const newItem = {
        sku: sku, // For machines: this is the serial number; for supplies: this is the UPC
        description: selectedMachine || res.data.row?.Description || res.data.row?.Name || res.data.row?.Style || sku,
        price: res.data.price || 0,
        quantity: quantity,
        qcFlaw: qcFlaw,
        serialNumber: selectedMachine ? sku : serialNumber, // For machines, the serial is in the UPC field
        size: res.data.row?.Size || "",
        isMachine: !!selectedMachine,
        collection: res.data.spreadsheetMatch,
        timestamp: new Date().toISOString(),
      };
      setScannedItems(prev => [...prev, newItem]);

      setSku("");
      setQuantity(1);
      setRequireSerial(false);
      setSerialNumber("");
      setSelectedMachine("");
      setQcFlaw("none");
    } catch (err) {
      console.log("SKU submission error:", err.response?.data);
      
      // Check if the error is about missing deal/session
      if (err.response?.data?.error?.includes("No deal found for this session")) {
        console.log("Session expired, attempting to restore session...");
        setMessage("Session expired, restoring session...");
        
        try {
          // Use the new session restore endpoint instead of just tracking number
          await axios.post(`${apiUrl}/api/session/restore`, {
            sessionId,
            trackingNumber,
            scannedItems,
            totalPrice
          });
          
          setMessage("Session restored! Retrying SKU scan...");
          
          // Now retry the original SKU submission
          const retryRes = await axios.post(`${apiUrl}/api/barcode`, {
            scanType: "sku",
            barcode: sku, // Always use the UPC field value
            sessionId,
            qcFlaw,
            serialNumber,
            quantity,
            machineType: selectedMachine, // Pass the machine type separately
          });

          // Handle the successful retry response
          if (retryRes.data.match === false) {
            console.log("No match found after retry, showing manual reference form");
            setMessage(retryRes.data.message || "SKU not found in spreadsheet.");
            setShowManualRef(true);
            setPendingSku(sku); // Always use the UPC field value
            return;
          }

          setMessage(retryRes.data.message || "Success!");
          setPrice(retryRes.data.price);
          setTotalPrice(totalPrice + (retryRes.data.price || 0) * quantity);
          setSpreadsheetMatch(retryRes.data.spreadsheetMatch);
          setDescriptionResult(retryRes.data.descriptionResult);

          // Add to scanned items
          const newItem = {
            sku: sku, // For machines: this is the serial number; for supplies: this is the UPC
            description: selectedMachine || retryRes.data.row?.Description || retryRes.data.row?.Name || retryRes.data.row?.Style || sku,
            price: retryRes.data.price || 0,
            quantity: quantity,
            qcFlaw: qcFlaw,
            serialNumber: selectedMachine ? sku : serialNumber, // For machines, the serial is in the UPC field
            size: retryRes.data.row?.Size || "",
            isMachine: !!selectedMachine,
            collection: retryRes.data.spreadsheetMatch,
            timestamp: new Date().toISOString(),
          };
          setScannedItems(prev => [...prev, newItem]);

          setSku("");
          setQuantity(1);
          setRequireSerial(false);
          setSerialNumber("");
          setSelectedMachine("");
          setQcFlaw("none");
          
        } catch (retryErr) {
          console.error("Failed to restore session and retry:", retryErr);
          setMessage("Failed to restore session. Please re-enter tracking number.");
          setDealFound(false); // Reset so user can re-enter tracking number
        }
      } else {
        setMessage(err.response?.data?.error || "Failed to process SKU.");
      }
    }
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

  const handleManualRefSubmit = async (e) => {
    e.preventDefault();
    setMessage("Checking manual reference...");
    try {
      const res = await axios.post(`${apiUrl}/api/barcode/manual`, {
        barcode: pendingSku === "NO_BARCODE" ? null : pendingSku,
        manualRef,
        sessionId,
        qcFlaw,
        serialNumber,
        quantity,
      });

      if (res.data.match) {
        setMessage(res.data.message || "Success!");
        setPrice(res.data.price);
        setTotalPrice(totalPrice + (res.data.price || 0) * quantity);
        setSpreadsheetMatch(res.data.spreadsheetMatch);
        setDescriptionResult(res.data.descriptionResult);

        // Add to scanned items
        const newItem = {
          sku: pendingSku === "NO_BARCODE" ? "" : pendingSku,
          description: res.data.descriptionResult?.description || pendingSku,
          price: res.data.price || 0,
          quantity: quantity,
          qcFlaw: qcFlaw,
          serialNumber: serialNumber,
          manualRef: manualRef,
          size: res.data.descriptionResult?.size || "",
          collection: res.data.spreadsheetMatch ? "Found via Manual Ref" : "Unknown",
          timestamp: new Date().toISOString(),
        };
        setScannedItems(prev => [...prev, newItem]);

        setShowManualRef(false);
        setManualRef("");
        setPendingSku("");
        setSku(""); // Reset UPC field
        setQuantity(1);
        setRequireSerial(false);
        setSerialNumber("");
        setQcFlaw("none");
      } else {
        setMessage(res.data.message || "Manual reference not found.");
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
    } catch (err) {
      if (err.response?.data?.match === false) {
        setMessage(err.response.data.message || "Manual reference not found.");
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
      } else if (err.response?.data?.error?.includes("No deal found for this session")) {
        console.log("Session expired during manual reference, attempting to restore...");
        setMessage("Session expired, restoring session...");
        
        try {
          // Use the new session restore endpoint instead of just tracking number
          await axios.post(`${apiUrl}/api/session/restore`, {
            sessionId,
            trackingNumber,
            scannedItems,
            totalPrice
          });
          
          setMessage("Session restored! Retrying manual reference...");
          
          // Now retry the original manual reference submission
          const retryRes = await axios.post(`${apiUrl}/api/barcode/manual`, {
            barcode: pendingSku === "NO_BARCODE" ? null : pendingSku,
            manualRef,
            sessionId,
            qcFlaw,
            serialNumber,
            quantity,
          });

          // Handle the successful retry response
          if (retryRes.data.match) {
            setMessage(retryRes.data.message || "Success!");
            setPrice(retryRes.data.price);
            setTotalPrice(totalPrice + (retryRes.data.price || 0) * quantity);
            setSpreadsheetMatch(retryRes.data.spreadsheetMatch);
            setDescriptionResult(retryRes.data.descriptionResult);

            // Add to scanned items and reset form
            const newItem = {
              sku: pendingSku === "NO_BARCODE" ? "" : pendingSku,
              description: retryRes.data.descriptionResult?.description || pendingSku,
              price: retryRes.data.price || 0,
              quantity: quantity,
              qcFlaw: qcFlaw,
              serialNumber: serialNumber,
              manualRef: manualRef,
              size: retryRes.data.descriptionResult?.size || "",
              collection: retryRes.data.spreadsheetMatch ? "Found via Manual Ref" : "Unknown",
              timestamp: new Date().toISOString(),
            };
            setScannedItems(prev => [...prev, newItem]);

            setSku("");
            setQuantity(1);
            setRequireSerial(false);
            setSerialNumber("");
            setSelectedMachine("");
            setQcFlaw("none");
            setShowManualRef(false);
            setManualRef("");
            setPendingSku("");
          } else {
            setMessage(retryRes.data.message || "Manual reference not found.");
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
          
        } catch (retryErr) {
          console.error("Failed to restore session and retry manual reference:", retryErr);
          setMessage("Failed to restore session. Please re-enter tracking number.");
          setDealFound(false); // Reset so user can re-enter tracking number
        }
      } else {
        setMessage(err.response?.data?.error || "Failed to process manual reference.");
      }
    }
  };

  const handleNewProductSubmit = async (e) => {
    e.preventDefault();
    setMessage("Adding new product...");
    try {
      const res = await axios.post(`${apiUrl}/api/product/new`, {
        barcode: (newProduct.barcode || pendingSku) === "NO_BARCODE" ? null : (newProduct.barcode || pendingSku),
        description: newProduct.description,
        size: newProduct.size,
        price: newProduct.price,
        qcFlaw: newProduct.qcFlaw,
        manualRef: newProduct.manualRef,
        mfr: newProduct.mfr,
        sessionId,
        quantity,
      });

      setMessage(res.data.message || "Product added successfully!");
      setPrice(res.data.price);
      setTotalPrice(totalPrice + (res.data.price || 0) * quantity);

      // Add to scanned items
      const newItem = {
        sku: (newProduct.barcode || pendingSku) === "NO_BARCODE" ? "" : (newProduct.barcode || pendingSku),
        description: newProduct.description,
        price: res.data.price || 0,
        quantity: quantity,
        qcFlaw: newProduct.qcFlaw,
        serialNumber: serialNumber,
        manualRef: newProduct.manualRef,
        size: newProduct.size || "",
        isNew: true,
        collection: newProduct.mfr && (newProduct.mfr.toUpperCase() === "RESMED" || newProduct.mfr.toUpperCase() === "RESPIRONICS") ? "Inventory" : "Overstock",
        timestamp: new Date().toISOString(),
      };
      setScannedItems(prev => [...prev, newItem]);

      setShowNewProductForm(false);
      setNewProduct({
        barcode: "",
        description: "",
        size: "",
        price: "",
        qcFlaw: "none",
        manualRef: "",
        mfr: "",
      });
      setShowManualRef(false);
      setManualRef("");
      setPendingSku("");
      setSku(""); // Reset UPC field
      setQuantity(1);
      setRequireSerial(false);
      setSerialNumber("");
      setQcFlaw("none");
    } catch (err) {
      if (err.response?.data?.error?.includes("No deal found for this session")) {
        console.log("Session expired during new product creation, attempting to restore...");
        setMessage("Session expired, restoring session...");
        
        try {
          // Use the new session restore endpoint instead of just tracking number
          await axios.post(`${apiUrl}/api/session/restore`, {
            sessionId,
            trackingNumber,
            scannedItems,
            totalPrice
          });
          
          setMessage("Session restored! Retrying new product creation...");
          
          // Now retry the new product submission
          const retryRes = await axios.post(`${apiUrl}/api/product/new`, {
            barcode: (newProduct.barcode || pendingSku) === "NO_BARCODE" ? null : (newProduct.barcode || pendingSku),
            description: newProduct.description,
            size: newProduct.size,
            price: newProduct.price,
            qcFlaw: newProduct.qcFlaw,
            manualRef: newProduct.manualRef,
            mfr: newProduct.mfr,
            sessionId,
            quantity,
          });

          setMessage(retryRes.data.message || "New product added successfully!");
          setPrice(retryRes.data.price);
          setTotalPrice(totalPrice + (retryRes.data.price || 0) * quantity);

          // Add to scanned items and reset form
          const newItem = {
            sku: (newProduct.barcode || pendingSku) === "NO_BARCODE" ? "" : (newProduct.barcode || pendingSku),
            description: newProduct.description,
            price: retryRes.data.price || 0,
            quantity: quantity,
            qcFlaw: newProduct.qcFlaw,
            serialNumber: serialNumber,
            manualRef: newProduct.manualRef,
            size: newProduct.size || "",
            isNew: true,
            collection: newProduct.mfr && (newProduct.mfr.toUpperCase() === "RESMED" || newProduct.mfr.toUpperCase() === "RESPIRONICS") ? "Inventory" : "Overstock",
            timestamp: new Date().toISOString(),
          };
          setScannedItems(prev => [...prev, newItem]);

          setShowNewProductForm(false);
          setNewProduct({
            barcode: "",
            description: "",
            size: "",
            price: "",
            qcFlaw: "none",
            manualRef: "",
            mfr: "",
          });
          setShowManualRef(false);
          setManualRef("");
          setPendingSku("");
          setSku(""); // Reset UPC field
          setQuantity(1);
          setRequireSerial(false);
          setSerialNumber("");
          setQcFlaw("none");
          
        } catch (retryErr) {
          console.error("Failed to restore session and retry new product creation:", retryErr);
          setMessage("Failed to restore session. Please re-enter tracking number.");
          setDealFound(false); // Reset so user can re-enter tracking number
        }
      } else {
        setMessage(err.response?.data?.error || "Failed to add new product.");
      }
    }
  };

  const handleUndo = async () => {
    try {
      const res = await axios.post(`${apiUrl}/api/barcode/undo`, {
        sessionId,
      });
      
      setMessage(res.data.message || "Last scan undone successfully");
      
      // Remove the last item from scanned items
      if (scannedItems.length > 0) {
        const lastItem = scannedItems[scannedItems.length - 1];
        setScannedItems(prev => prev.slice(0, -1));
        setTotalPrice(prev => prev - (lastItem.price * lastItem.quantity));
      }
      
      // Clear any pending states
      setShowManualRef(false);
      setManualRef("");
      setPendingSku("");
      setShowNewProductForm(false);
      setSpreadsheetMatch(null);
      setDescriptionResult("");
      setPrice(null);
    } catch (err) {
      setMessage(err.response?.data?.error || "Failed to undo last scan.");
    }
  };

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
                      if (machine) {
                        setMessage(`${machine} selected! Enter the serial number in the UPC field below.`);
                      } else {
                        setMessage("");
                      }
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
                onManualEntry={handleManualEntry}
                onNoBarcodeEntry={handleNoBarcodeEntry}
                selectedMachine={selectedMachine}
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
                  if (trackingNumber && scannedItems.length > 0) {
                    try {
                      setMessage("Finalizing previous batch and submitting to Pipedrive...");
                      
                      // First restore the session to ensure backend has the data
                      await axios.post(`${apiUrl}/api/session/restore`, {
                        sessionId,
                        trackingNumber,
                        scannedItems,
                        totalPrice
                      });
                      
                      // Then submit the current tracking to finalize and send to Pipedrive
                      await axios.post(`${apiUrl}/api/barcode`, {
                        scanType: "tracking",
                        barcode: trackingNumber,
                        sessionId,
                      });
                      
                      setMessage("Previous batch submitted to Pipedrive successfully!");
                    } catch (err) {
                      console.error("Failed to finalize previous tracking batch:", err);
                      setMessage("Failed to finalize previous tracking batch.");
                    }
                  }
                  
                  // Clear workflow state
                  clearWorkflowState();
                  
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
        </div>
      </div>
      <div className="bg-base-100 rounded-xl shadow-lg p-6 w-[70%]">
        <h2 className="text-2xl font-bold mb-4">Scanning Summary</h2>
        
        {/* Status Information */}
        {message && (
          <div className="alert alert-info mb-4">{message}</div>
        )}
        
        {spreadsheetMatch !== null && (
          <div className="mb-4 p-4 bg-base-200 rounded">
            <div className="text-lg font-semibold">
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
          </div>
        )}
        
        {descriptionResult && descriptionResult.description && (
          <div className="alert alert-success mb-4">
            <strong>Product Description:</strong> {descriptionResult.description}
          </div>
        )}
        
        {typeof price === "number" && !isNaN(price) && (
          <div className="alert alert-info mb-4">
            <strong>Last Item Price:</strong> ${price.toFixed(2)}
          </div>
        )}
        
        {typeof totalPrice === "number" && !isNaN(totalPrice) && totalPrice > 0 && (
          <div className="alert alert-warning mb-4">
            <strong>Total Batch Price:</strong> ${totalPrice.toFixed(2)}
          </div>
        )}
        
        {/* Scanned Items Summary */}
        {scannedItems.length > 0 ? (
          <div className="mb-4">
            <h3 className="text-xl font-bold mb-4 text-primary">
              Scanned Items ({scannedItems.reduce((total, item) => total + (item.quantity || 1), 0)} items)
            </h3>
            <div className="max-h-[60vh] overflow-y-auto">
              <div className="space-y-3">
                {scannedItems.map((item, index) => (
                  <div key={index} className="p-4 bg-base-200 rounded-lg border">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-semibold text-lg text-base-content">
                          {item.description}
                        </div>
                        <div className="text-sm text-base-content/70 mt-1">
                          SKU: {item.sku || "N/A"}
                          {item.size && ` • Size: ${item.size}`}
                          {item.serialNumber && ` • Serial: ${item.serialNumber}`}
                          {item.manualRef && ` • Ref: ${item.manualRef}`}
                        </div>
                        {(item.qcFlaw && item.qcFlaw !== "none") && (
                          <div className="badge badge-warning mt-2">
                            {item.qcFlaw}
                          </div>
                        )}
                        {item.isNew && (
                          <div className="badge badge-success mt-2 ml-2">
                            New Product
                          </div>
                        )}
                        {item.isMachine && (
                          <div className="badge badge-info mt-2 ml-2">
                            Machine
                          </div>
                        )}
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-lg font-bold text-success">
                          ${item.price?.toFixed(2) || "0.00"}
                        </div>
                        {item.quantity && item.quantity > 1 && (
                          <div className="text-sm text-base-content/70">
                            Qty: {item.quantity}
                          </div>
                        )}
                        {item.quantity && item.quantity > 1 && (
                          <div className="text-sm font-semibold text-primary">
                            Total: ${((item.price || 0) * item.quantity).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-base-content/50 mt-2">
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 p-4 bg-primary text-primary-content rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold">Batch Total:</span>
                <span className="text-2xl font-bold">
                  ${scannedItems.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0).toFixed(2)}
                </span>
              </div>
              <div className="text-sm opacity-80 mt-1">
                {scannedItems.reduce((total, item) => total + (item.quantity || 1), 0)} items total
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-6xl opacity-20 mb-4">📦</div>
            <div className="text-xl text-base-content/60">No items scanned yet</div>
            <div className="text-sm text-base-content/40 mt-2">
              Scan a tracking number to get started
            </div>
          </div>
        )}
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
              <option value="notoriginalpackaging">Not in Original Packaging</option>
              <option value="yellow">Yellow</option>
              <option value="other">Other</option> 
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
