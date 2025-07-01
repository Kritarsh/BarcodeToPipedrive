import React from "react";

function SkuForm({
  sku,
  setSku,
  handleSkuSubmit,
  setSkuInputAndFocus,
  showManualRef,
  qcFlaw,
  setQcFlaw,
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
          ref={setSkuInputAndFocus}
          className="input input-bordered w-full mt-1"
          placeholder="Scan or enter UPC"
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
          <option value="other">Not in Original Packaging</option>
          <option value="donotaccept">Do Not Accept</option>
          <option value="tornpackaging">Torn Packaging</option>
          <option value="yellow">Yellow</option>
        </select>
      </label>
      <button
        type="submit"
        className="btn btn-success w-full"
        disabled={showManualRef}
      >
        Scan UPC
      </button>
    </form>
  );
}

export default SkuForm;