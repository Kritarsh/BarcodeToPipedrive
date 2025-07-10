import React, { useState } from "react";

function SummaryModal({ items, onClose, onSubmit }) {
  console.log("SummaryModal rendered with items:", items);
  const [userChoices, setUserChoices] = useState(
    items.map((item) => ({ upc: item.upc, action: "addToOverstock" }))
  );

  const handleActionChange = (index, action) => {
    const updatedChoices = [...userChoices];
    updatedChoices[index].action = action;
    setUserChoices(updatedChoices);
  };

  const handleSubmit = () => {
    onSubmit(userChoices);
  };

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <h2 className="font-bold text-lg mb-4">Review Scanned Items</h2>
        {items.length === 0 ? (
          <p className="text-center py-4">No items scanned yet.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto mb-4">
            <ul className="space-y-3">
              {items.map((item, index) => (
                <li
                  key={item.upc}
                  className="border border-base-300 rounded-lg p-3"
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                    <span className="font-medium">
                      {item.description} - ${item.price}
                    </span>
                    <select
                      value={userChoices[index].action}
                      onChange={(e) => handleActionChange(index, e.target.value)}
                      className="select select-bordered select-sm w-full sm:w-auto"
                    >
                      <option value="addToOverstock">Add to Overstock</option>
                      <option value="addToMagento">Add to Magento</option>
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="modal-action flex gap-2 justify-center">
          <button className="btn btn-outline w-auto" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary w-auto" onClick={handleSubmit}>
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

export default SummaryModal;
