import express from "express";
import { getSession, setSession } from "../sessionHelpers.js";
import { findDealIdByTrackingNumber, addNoteToPipedrive } from "../pipedriveHelpers.js";

export default function barcodeRoutes({ redisClient, PIPEDRIVE_API_URL, PIPEDRIVE_API_TOKEN }) {
  const router = express.Router();

  router.post("/", async (req, res) => {
    const { scanType, barcode, sessionId, price, serialNumber, qcFlaw } = req.body;
    if (!scanType || !barcode || !sessionId) {
      return res.status(400).json({ error: "scanType, barcode, and sessionId are required" });
    }

    try {
      if (scanType === "tracking") {
        const oldSession = await getSession(redisClient, sessionId);
        if (
          oldSession &&
          oldSession.skuEntries &&
          oldSession.skuEntries.length > 0 &&
          oldSession.dealId
        ) {
          // ...summary logic...
          const allNotesWithTotal = "Summary here"; // Replace with your summary logic
          await addNoteToPipedrive(allNotesWithTotal, oldSession.dealId, PIPEDRIVE_API_URL, PIPEDRIVE_API_TOKEN);
        }
        // ...reset session logic...
        const dealId = await findDealIdByTrackingNumber(barcode, PIPEDRIVE_API_URL, PIPEDRIVE_API_TOKEN);
        if (!dealId) {
          return res.status(404).json({ error: "Deal not found for tracking number" });
        }
        await setSession(redisClient, sessionId, {
          dealId,
          noteContent: [],
          prices: [],
          skuEntries: [],
        });
        return res.json({ message: "Deal found", dealId });
      }

      if (scanType === "sku") {
        // ...your SKU logic...
        return res.json({ message: "SKU processed" });
      }
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}