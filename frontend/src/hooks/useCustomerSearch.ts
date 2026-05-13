import { useState, useEffect } from 'react';
import type { Customer } from '../types';

interface Options {
  token: string | null;
  partyRole?: 'customer' | 'supplier' | 'both' | 'all';
}

export function useCustomerSearch({ token, partyRole = 'customer' }: Options) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  useEffect(() => {
    if (!token) return;
    const fetchCustomers = async () => {
      const params = new URLSearchParams();
      if (customerSearch) params.set('search', customerSearch);
      if (partyRole !== 'all') params.set('partyRole', partyRole);
      const query = params.toString();
      const res = await fetch(`/api/customers${query ? `?${query}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setCustomers(json.data ?? []);
    };
    const timer = setTimeout(fetchCustomers, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, partyRole, token]);

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
