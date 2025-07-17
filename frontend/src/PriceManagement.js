import React, { useState, useEffect } from 'react';
import { api } from './api/config';

function PriceManagement() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCollection, setFilterCollection] = useState('all');
  const [editingProduct, setEditingProduct] = useState(null);
  const [editPrice, setEditPrice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

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

  const handleEditPrice = (product) => {
    setEditingProduct(product);
    setEditPrice(product.Price ? product.Price.toString() : '0');
  };

  const handleSavePrice = async () => {
    if (!editingProduct) return;

    try {
      setSaving(true);
      const response = await api.put(`/api/products/${editingProduct.collection}/${editingProduct._id}/price`, {
        price: editPrice
      });

      if (!response.data) {
        throw new Error('Failed to update price');
      }

      // Update the product in the local state
      setProducts(prev => prev.map(p => 
        p._id === editingProduct._id 
          ? { ...p, Price: parseFloat(editPrice) }
          : p
      ));

      setEditingProduct(null);
      setEditPrice('');
    } catch (err) {
      setError('Failed to update price: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingProduct(null);
    setEditPrice('');
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = !searchTerm || 
      (product.Style && product.Style.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (product.RefNum && product.RefNum.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (product.MFR && product.MFR.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (product.UPC && product.UPC.includes(searchTerm));

    const matchesFilter = filterCollection === 'all' || product.collection === filterCollection;

    return matchesSearch && matchesFilter;
  });

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
        <p className="text-gray-600 dark:text-gray-400 mb-6">Manage prices for inventory and overstock items</p>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4 mb-6 flex items-center justify-between">
            <span className="text-red-800 dark:text-red-200">{error}</span>
            <button 
              onClick={() => setError('')} 
              className="text-red-800 dark:text-red-200 hover:text-red-900 dark:hover:text-red-100 text-xl font-semibold"
            >
              ×
            </button>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg dark:shadow-gray-900/20 mb-6 p-4 border dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </select>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredProducts.map((product) => (
                  <tr key={`${product.collection}-${product._id}`} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        product.collection === 'Inventory' 
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200' 
                          : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                      }`}>
                        {product.collection}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {product.RefNum || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono">
                      {product.UPC || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {product.MFR || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate">
                      {product.Style || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {product.Size || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingProduct && editingProduct._id === product._id ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                          disabled={saving}
                        />
                      ) : (
                        <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          ${product.Price ? product.Price.toFixed(2) : '0.00'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {editingProduct && editingProduct._id === product._id ? (
                        <div className="flex space-x-2">
                          <button
                            onClick={handleSavePrice}
                            disabled={saving}
                            className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors"
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            disabled={saving}
                            className="bg-gray-600 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleEditPrice(product)}
                          className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white px-3 py-1 rounded text-sm transition-colors"
                        >
                          Edit Price
                        </button>
                      )}
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
