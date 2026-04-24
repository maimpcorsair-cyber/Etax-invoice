import { useState, useEffect } from 'react';
import type { Customer } from '../types';

interface Options {
  token: string | null;
}

export function useCustomerSearch({ token }: Options) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  useEffect(() => {
    if (!token) return;
    const fetchCustomers = async () => {
      const params = customerSearch
        ? `?search=${encodeURIComponent(customerSearch)}`
        : '';
      const res = await fetch(`/api/customers${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setCustomers(json.data ?? []);
    };
    const timer = setTimeout(fetchCustomers, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, token]);

  const clearResults = () => setCustomers([]);
  const clearCustomer = () => {
    setSelectedCustomerId('');
    setCustomerSearch('');
  };

  return {
    customers,
    customerSearch,
    setCustomerSearch,
    selectedCustomerId,
    setSelectedCustomerId,
    clearResults,
    clearCustomer,
  };
}
