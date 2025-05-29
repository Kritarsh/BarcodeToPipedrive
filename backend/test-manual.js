import axios from "axios";

const BASE_URL = "http://localhost:5000";
const sessionId = "test-session-123";
const trackingNumber = "9202290182632207021471";
const sku = "9420012425898";
const manualRef = "MANUAL-REF-EXAMPLE"; // Change as needed

async function testManualFlow() {
  try {
    // 1. Send tracking number
    const trackingRes = await axios.post(`${BASE_URL}/api/barcode`, {
      scanType: "tracking",
      barcode: trackingNumber,
      sessionId,
    });
    console.log("Tracking response:", trackingRes.data);

    // 2. Send SKU
    const skuRes = await axios.post(`${BASE_URL}/api/barcode`, {
      scanType: "sku",
      barcode: sku,
      sessionId,
    });
    console.log("SKU response:", skuRes.data);

    // 3. If manual is needed, send manualRef
    if (
      skuRes.data.reason === "no_brand_or_model" ||
      skuRes.data.reason === "no_brand_model"
    ) {
      const manualRes = await axios.post(`${BASE_URL}/api/barcode/manual`, {
        barcode: sku,
        manualRef,
        sessionId,
      });
      console.log("Manual reference response:", manualRes.data);
    }
  } catch (err) {
    console.error("Test error:", err.response?.data || err.message);
  }
}

testManualFlow();
