// Tipos seguros para parâmetros das tools
export interface CreateCustomerParams {
  apiKey?: string;
  name: string;
  cellphone: string;
  email: string;
  taxId: string;
}

export interface ListCustomersParams {
  apiKey?: string;
}

export interface CreateBillingParams {
  apiKey?: string;
  frequency?: "ONE_TIME" | "MULTIPLE_PAYMENTS";
  methods?: ["PIX"];
  products: Array<{
    externalId: string;
    name: string;
    description: string;
    quantity: number;
    price: number;
  }>;
  returnUrl: string;
  completionUrl: string;
  customerId?: string;
}

export interface CreatePixQrCodeParams {
  apiKey?: string;
  amount: number;
  expiresIn?: number;
  description?: string;
  customer?: {
    name: string;
    cellphone: string;
    email: string;
    taxId: string;
  };
}

export interface CreateCouponParams {
  apiKey?: string;
  code: string;
  discountKind: "PERCENTAGE" | "FIXED";
  discount: number;
  notes?: string;
  maxRedeems?: number;
  metadata?: Record<string, unknown>;
}
