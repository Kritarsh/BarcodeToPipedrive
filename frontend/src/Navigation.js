import React from 'react';
import { Link, useLocation } from 'react-router-dom';

function Navigation() {
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <nav className="bg-white dark:bg-gray-800 shadow-md border-b dark:border-gray-700 transition-colors">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Inventory System</h1>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Link
                to="/"
                className={`${
                  isActive('/') 
                    ? 'border-blue-500 text-gray-900 dark:text-gray-100' 
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors`}
              >
                Regular Inventory
              </Link>
              <Link
                to="/month-end-inventory"
                className={`${
                  isActive('/month-end-inventory') 
                    ? 'border-blue-500 text-gray-900 dark:text-gray-100' 
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors`}
              >
                Month End Inventory
              </Link>
              <Link
                to="/price-management"
                className={`${
                  isActive('/price-management') 
                    ? 'border-blue-500 text-gray-900 dark:text-gray-100' 
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors`}
              >
                Price Management
              </Link>
              <Link
                to="/magento-inventory"
                className={`${
                  isActive('/magento-inventory') 
                    ? 'border-blue-500 text-gray-900 dark:text-gray-100' 
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors`}
              >
                Magento Inventory
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className="sm:hidden">
        <div className="pt-2 pb-3 space-y-1 bg-white dark:bg-gray-800 border-t dark:border-gray-700">
          <Link
            to="/"
            className={`${
              isActive('/') 
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-700 dark:text-blue-300' 
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-800 dark:hover:text-gray-200'
            } block pl-3 pr-4 py-2 border-l-4 text-base font-medium transition-colors`}
          >
            Regular Inventory
          </Link>
          <Link
            to="/month-end-inventory"
            className={`${
              isActive('/month-end-inventory') 
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-700 dark:text-blue-300' 
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-800 dark:hover:text-gray-200'
            } block pl-3 pr-4 py-2 border-l-4 text-base font-medium transition-colors`}
          >
            Month End Inventory
          </Link>
          <Link
            to="/price-management"
            className={`${
              isActive('/price-management') 
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-700 dark:text-blue-300' 
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-800 dark:hover:text-gray-200'
            } block pl-3 pr-4 py-2 border-l-4 text-base font-medium transition-colors`}
          >
            Price Management
          </Link>
          <Link
            to="/magento-inventory"
            className={`${
              isActive('/magento-inventory') 
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-700 dark:text-blue-300' 
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-800 dark:hover:text-gray-200'
            } block pl-3 pr-4 py-2 border-l-4 text-base font-medium transition-colors`}
          >
            Magento Inventory
          </Link>
        </div>
      </div>
    </nav>
  );
}

export default Navigation;
