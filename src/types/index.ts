// SmartBill 型定義

export interface CompanyInfo {
  id: number;
  company_name: string;
  department_name: string;
  person_name: string;
  postal_code: string;
  address: string;
  address_number: string;
  building_name: string;
  tel: string;
  fax: string;
  email: string;
  website: string;
  invoice_registration_no: string;
  bank_name: string;
  bank_branch: string;
  account_type: string;
  account_number: string;
  account_holder: string;
  default_closing_day?: string;
  default_payment_day?: string;
  tax_rate_column_mode?: 'AUTO' | 'ON' | 'OFF';
  tax_rounding_unit?: 'PER_LINE' | 'PER_RATE';
  tax_rounding_mode?: 'FLOOR' | 'CEIL' | 'ROUND';
  estimate_code_column_enabled?: boolean;
  estimate_code_column_kind?: 'JAN' | 'PRODUCT_CODE';
}

export interface Category {
  id: number;
  category_name: string;
  tax_rate: number;
  display_order: number;
  is_active: number;
}

export interface Product {
  id: number;
  product_name: string;
  product_code: string;
  jan_code: string;
  category_id: number | null;
  category_name?: string;
  unit_price: number;
  cost_price: number;
  retail_price: number;
  discount_rate: number;
  tax_rate: number | null;
  min_lot: number;
  is_wholesale: number;
  is_active: number;
}

export interface Client {
  id: number;
  client_name: string;
  department_name: string;
  postal_code: string;
  address: string;
  address_number: string;
  building_name: string;
  client_code: string;
  person_name: string;
  email: string;
  portal_email?: string | null;
  closing_day: string;
  payment_day: string;
  use_wholesale_price: number;
  is_active: number;
}

export interface Estimate {
  id: number;
  estimate_no: string;
  estimate_date: string;
  client_id: number;
  client_name?: string;
  valid_until: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes: string;
  status: string;
}

export interface EstimateItem {
  id: number;
  estimate_id: number;
  product_id: number | null;
  product_name: string;
  jan_code: string;
  quantity: number;
  unit_price: number;
  retail_price: number;
  use_retail_price: number;
  tax_rate: number;
  amount: number;
  notes: string;
  display_order: number;
}

export interface Delivery {
  id: number;
  delivery_no: string;
  delivery_date: string;
  client_id: number;
  client_name?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes: string;
  estimate_id: number | null;
  invoice_id: number | null;
  status: string;
}

export interface DeliveryItem {
  id: number;
  delivery_id: number;
  product_id: number | null;
  product_name: string;
  jan_code: string;
  category_id: number | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  amount: number;
  notes: string;
  display_order: number;
}

export interface Invoice {
  id: number;
  invoice_no: string;
  invoice_date: string;
  client_id: number;
  client_name?: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
  closing_date: string | null;
  payment_due_date: string | null;
  subtotal: number;
  tax_amount: number;
  tax_adjustment?: number;
  tax_adjustment_reason?: string;
  total_amount: number;
  notes: string;
  status: string;
  sent_at?: string | null;
  sent_to_email?: string | null;
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  delivery_id: number | null;
  delivery_date: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  amount: number;
  display_order: number;
}
