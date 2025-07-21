import React from "react";

function SkuForm({
  sku,
  setSku,
  handleSkuSubmit,
  setSkuInputAndFocus,
  skuInputRef,
  showManualRef,
  qcFlaw,
  setQcFlaw,
  quantity,
  setQuantity,
  onManualEntry,
  onNoBarcodeEntry,
}) {
  return (
    <form onSubmit={handleSkuSubmit} className="mb-6">
      <label className="block mb-2 font-medium text-base-content">
        UPC:
        <input
          type="text"
          value={sku || ""}
          onChange={(e) => setSku(e.target.value)}
          required
          ref={setSkuInputAndFocus || skuInputRef}
          className="input input-bordered w-full mt-1"
          placeholder="Scan or enter UPC"
        />
      </label>
      <label className="block mb-2 font-medium text-base-content">
        Quantity:
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          className="input input-bordered w-full mt-1"
          placeholder="Enter quantity"
          required
        />
      </label>
      <label className="block mb-2 font-medium text-base-content">
        Quality Control:
        <select
          className="select select-bordered w-full mb-2"
          value={qcFlaw}
          onChange={(e) => setQcFlaw(e.target.value)}
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
      </label>
      <div className="flex flex-col gap-2">
        <button
          type="submit"
          className="btn btn-success w-full"
          disabled={showManualRef}
        >
          Scan UPC
        </button>
        <button
          type="button"
          className="btn btn-warning w-full"
          disabled={showManualRef}
          onClick={() => onNoBarcodeEntry && onNoBarcodeEntry()}
        >
          No Barcode Available
        </button>
      </div>
    </form>
  );
}

export default SkuForm;