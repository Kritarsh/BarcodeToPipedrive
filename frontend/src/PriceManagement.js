import React, { useState, useEffect, useMemo } from 'react';
import { api } from './api/config';

function PriceManagement() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Load from localStorage or use default values
  const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem('pm_searchTerm') || '');
  const [filterCollection, setFilterCollection] = useState(() => localStorage.getItem('pm_filterCollection') || 'all');
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  // Save search term to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('pm_searchTerm', searchTerm);
  }, [searchTerm]);

  // Save filter collection to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('pm_filterCollection', filterCollection);
  }, [filterCollection]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/products/prices');
      if (!response.data) {
        throw new Error('No data received');
      }
      setProducts(response.data);
    } catch (err) {
      setError('Failed to load products: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditField = (product, field, currentValue) => {
    // Use composite key: collection-id to handle duplicates between regular and month-end collections
    setEditingField({ productId: `${product.collection}-${product._id}`, field, originalId: product._id, collection: product.collection });
    setEditValue(currentValue || '');
  };

  const handleSaveField = async () => {
    if (!editingField) return;

    try {
      setSaving(true);
      const product = products.find(p => `${p.collection}-${p._id}` === editingField.productId);
      
      // Create update object with the edited field
      const updateData = {};
      
      if (editingField.field === 'price') {
        updateData.price = parseFloat(editValue) || 0;
      } else if (editingField.field === 'refNum') {
        updateData.refNum = editValue;
      } else if (editingField.field === 'upc') {
        updateData.upc = editValue;
      } else if (editingField.field === 'mfr') {
        updateData.mfr = editValue;
      } else if (editingField.field === 'style') {
        updateData.style = editValue;
      } else if (editingField.field === 'size') {
        updateData.size = editValue;
      }

      const response = await api.put(`/api/products/${product.collection}/${product._id}`, updateData);

      if (!response.data) {
        throw new Error('Failed to update product');
      }

      // Update the product in the local state with proper field mapping
      setProducts(prev => prev.map(p => 
        `${p.collection}-${p._id}` === editingField.productId 
          ? {
              ...p,
              // Map the backend field names to frontend expected names
              RefNum: response.data.product.RefNum,
              UPC: response.data.product.UPC,
              MFR: response.data.product.MFR,
              Style: response.data.product.Style,
              Size: response.data.product.Size,
              Price: response.data.product.Price,
              // Keep the collection field from original product
              collection: p.collection
            }
          : p
      ));

      setEditingField(null);
      setEditValue('');
    } catch (err) {
      setError('Failed to update product: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSaveField();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      if (!product) return false;
      
      const searchLower = searchTerm.toLowerCase().trim();
      const matchesSearch = !searchTerm || 
        (product.Style && String(product.Style).toLowerCase().includes(searchLower)) ||
        (product.RefNum && String(product.RefNum).toLowerCase().includes(searchLower)) ||
        (product.MFR && String(product.MFR).toLowerCase().includes(searchLower)) ||
        (product.UPC && String(product.UPC).toLowerCase().includes(searchLower));

      const matchesFilter = filterCollection === 'all' || product.collection === filterCollection;

      return matchesSearch && matchesFilter;
    });
  }, [products, searchTerm, filterCollection]);

  const renderEditableField = (product, field, value, isNumber = false) => {
    const compositeId = `${product.collection}-${product._id}`;
    const isEditing = editingField && editingField.productId === compositeId && editingField.field === field;
    
    if (isEditing) {
      return (
        <input
          type={isNumber ? "number" : "text"}
          step={isNumber ? "0.01" : undefined}
          min={isNumber ? "0" : undefined}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyPress}
          onBlur={handleSaveField}
          className="w-full px-2 py-1 border border-blue-500 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          disabled={saving}
          autoFocus
        />
      );
    }

    return (
      <div
        className="w-full px-2 py-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
        onDoubleClick={() => handleEditField(product, field, value)}
        title="Double-click to edit"
      >
        {field === 'collection' ? (
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
            value === 'Inventory' 
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200' 
              : value === 'Overstock'
              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
              : value === 'MonthEndInventory'
              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200'
              : value === 'MonthEndOverstock'
              ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200'
              : 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-200'
          }`}>
            {value}
          </span>
        ) : field === 'price' ? (
          <span className="text-lg font-semibold">
            ${(parseFloat(value) || 0).toFixed(2)}
          </span>
        ) : field === 'upc' ? (
          <span className="font-mono text-sm">
            {value || '-'}
          </span>
        ) : (
          <span>
            {value || '-'}
          </span>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="max-w-full mx-auto p-6">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">Price Management</h2>
          <div className="flex items-center justify-center h-64">
            <div className="text-lg text-gray-600 dark:text-gray-400">Loading products...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="max-w-full mx-auto p-6">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Price Management</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Manage prices for inventory and overstock items. Double-click any field to edit.
        </p>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4 mb-6 flex items-center justify-between">
            <span className="text-red-800 dark:text-red-200">{error}</span>
            <button 
              onClick={() => setError('')} 
              className="text-red-800 dark:text-red-200 hover:text-red-900 dark:hover:text-red-100 text-xl font-semibold"
            >
              
            </button>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg dark:shadow-gray-900/20 mb-6 p-4 border dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Search
              </label>
              <input
                id="search"
                type="text"
                placeholder="Search by name, ref num, manufacturer, or UPC..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="collection" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Collection
              </label>
              <select
                id="collection"
                value={filterCollection}
                onChange={(e) => setFilterCollection(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              >
                <option value="all">All Collections</option>
                <option value="Inventory">Inventory</option>
                <option value="Overstock">Overstock</option>
                <option value="MonthEndInventory">Month End Inventory</option>
                <option value="MonthEndOverstock">Month End Overstock</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={fetchProducts}
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-md transition-colors"
              >
                {loading ? 'Refreshing...' : 'Refresh Data'}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg dark:shadow-gray-900/20 overflow-hidden border dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Collection
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Ref Num
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    UPC
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Manufacturer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Price
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredProducts.map((product) => (
                  <tr key={`${product.collection}-${product._id}`} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {renderEditableField(product, 'collection', product.collection)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {renderEditableField(product, 'refNum', product.RefNum)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {renderEditableField(product, 'upc', product.UPC)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {renderEditableField(product, 'mfr', product.MFR)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {renderEditableField(product, 'style', product.Style)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {renderEditableField(product, 'size', product.Size)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {renderEditableField(product, 'price', product.Price, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredProducts.length === 0 && !loading && (
          <div className="text-center py-12">
            <div className="text-gray-500 dark:text-gray-400 text-lg">
              No products found matching your criteria.
            </div>
          </div>
        )}

        <div className="mt-6 text-sm text-gray-600 dark:text-gray-400 text-center">
          Showing {filteredProducts.length} of {products.length} products
        </div>
      </div>
    </div>
  );
}

export default PriceManagement;
