/**
 * XOOBAY API Client
 * 
 * 集成 XOOBAY 产品 API，提供产品数据源
 */

interface XOOBAYProduct {
  id: number;
  name: string;
  money: string;
  shop_id: number;
  img_logo: string;
}

interface XOOBAYProductDetail {
  id: string;
  name: string;
  description: string;
  short_description: string;
  category: string;
  sku: string;
  price: string;
  image_url: string;
  gallery_images: string[];
  brand_name: string;
  brand_url: string;
  status: number;
  store_id: number;
  store_name: string;
  store_description: string;
}

interface XOOBAYStore {
  id: number;
  name: string;
  url: string;
  store_url: string;
  remark: string;
}

interface XOOBAYResponse<T> {
  code: number;
  msg: string;
  data: T;
}

interface XOOBAYProductListResponse {
  list: XOOBAYProduct[];
  pager: {
    page: number;
    count: number;
    pageCount: number;
  };
}

export class XOOBAYClient {
  private baseUrl: string;
  private apiKey: string;
  private lang: string;

  constructor() {
    this.baseUrl = process.env.XOOBAY_BASE_URL || 'https://www.xoobay.com';
    this.apiKey = process.env.XOOBAY_API_KEY || 'xoobay_api_ai_geo';
    this.lang = process.env.XOOBAY_LANG || 'en';
  }

  /**
   * 获取产品列表
   */
  async getProductList(params: {
    pageNo?: number;
    name?: string;
    shopId?: string;
    lang?: string;
  } = {}): Promise<XOOBAYProductListResponse> {
    const { pageNo = 1, name = '', shopId = '', lang = this.lang } = params;
    
    const url = new URL(`${this.baseUrl}/api-geo/product-list`);
    url.searchParams.set('pageNo', String(pageNo));
    if (name) url.searchParams.set('name', name);
    if (shopId) url.searchParams.set('shopId', shopId);
    url.searchParams.set('lang', lang);
    url.searchParams.set('apiKey', this.apiKey);

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json() as XOOBAYResponse<XOOBAYProductListResponse>;
      
      if (result.code !== 200) {
        throw new Error(`API error: ${result.msg}`);
      }

      return result.data;
    } catch (error) {
      console.error('XOOBAY API error:', error);
      throw error;
    }
  }

  /**
   * 获取产品详情
   */
  async getProductInfo(id: string | number, lang = this.lang): Promise<XOOBAYProductDetail> {
    const url = new URL(`${this.baseUrl}/api-geo/product-info`);
    url.searchParams.set('id', String(id));
    url.searchParams.set('lang', lang);
    url.searchParams.set('apiKey', this.apiKey);

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json() as XOOBAYResponse<XOOBAYProductDetail>;
      
      if (result.code !== 200) {
        throw new Error(`API error: ${result.msg}`);
      }

      return result.data;
    } catch (error) {
      console.error('XOOBAY API error:', error);
      throw error;
    }
  }

  /**
   * 获取商家详情
   */
  async getStoreInfo(id: string | number, lang = this.lang): Promise<XOOBAYStore> {
    const url = new URL(`${this.baseUrl}/api-geo/store-info`);
    url.searchParams.set('id', String(id));
    url.searchParams.set('lang', lang);
    url.searchParams.set('apiKey', this.apiKey);

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json() as XOOBAYResponse<XOOBAYStore>;
      
      if (result.code !== 200) {
        throw new Error(`API error: ${result.msg}`);
      }

      return result.data;
    } catch (error) {
      console.error('XOOBAY API error:', error);
      throw error;
    }
  }

  /**
   * 搜索产品
   */
  async searchProducts(query: string, pageNo = 1, lang = this.lang): Promise<XOOBAYProductListResponse> {
    return this.getProductList({ pageNo, name: query, lang });
  }
}

// 单例实例
let clientInstance: XOOBAYClient | null = null;

export function getXOOBAYClient(): XOOBAYClient {
  if (!clientInstance) {
    clientInstance = new XOOBAYClient();
  }
  return clientInstance;
}
