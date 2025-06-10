import React from "react";

function TrackingForm({ trackingNumber, setTrackingNumber, dealFound, trackingInputRef, onSubmit }) {
  return (
    <form onSubmit={onSubmit} className="mb-6">
      <label className="block mb-2 font-medium text-white">
        Tracking Number:
        <input
          type="text"
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          required
          disabled={dealFound}
          ref={trackingInputRef}
          className="input input-bordered w-full mt-1 disabled:bg-base-200"
        />
      </label>
      <button
        type="submit"
        disabled={dealFound}
        className="btn btn-primary w-full"
      >
        Scan Tracking
      </button>
    </form>
  );
}

export default TrackingForm;