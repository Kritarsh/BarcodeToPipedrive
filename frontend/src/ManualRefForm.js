import React from "react";

function ManualRefForm({
  manualRef,
  setManualRef,
  handleManualRefSubmit,
  manualRefInputRef,
}) {
  return (
    <form onSubmit={handleManualRefSubmit} className="mb-6">
      <label className="block mb-2 font-medium text-base-content">
        Manual Reference Number:
        <input
          type="text"
          value={manualRef}
          onChange={(e) => setManualRef(e.target.value)}
          required
          className="input input-bordered w-full mt-1"
          ref={manualRefInputRef}
        />
      </label>
      <button type="submit" className="btn btn-warning w-full">
        Submit Manual Reference
      </button>
    </form>
  );
}

export default ManualRefForm;