import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../../shared/events/event-bus.service';

@Injectable()
export class CommerceService {
  private readonly logger = new Logger(CommerceService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  // ─── Categories ───────────────────────────────

  async createCategory(tenantId: string, data: any) {
    return this.prisma.category.create({ data: { tenantId, ...data } });
  }

  async getCategories(tenantId: string) {
    return this.prisma.category.findMany({
      where: { tenantId, isActive: true },
      include: { _count: { select: { products: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async updateCategory(categoryId: string, data: any) {
    const cat = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!cat) throw new NotFoundException('Category not found');
    return this.prisma.category.update({ where: { id: categoryId }, data });
  }

  async deleteCategory(categoryId: string) {
    await this.prisma.category.update({ where: { id: categoryId }, data: { isActive: false } });
    return { message: 'Category deleted' };
  }

  // ─── Products ─────────────────────────────────

  private readonly PRODUCT_TYPES = ['physical', 'service', 'digital', 'donation', 'membership', 'event_ticket'];

  async createProduct(tenantId: string, data: any) {
    const type = data.type || 'physical';
    if (!this.PRODUCT_TYPES.includes(type)) {
      throw new BadRequestException(`Invalid product type. Must be one of: ${this.PRODUCT_TYPES.join(', ')}`);
    }

    return this.prisma.product.create({
      data: {
        tenantId,
        name: data.name,
        slug: data.slug,
        description: data.description,
        type,
        price: data.price,
        compareAtPrice: data.compareAtPrice,
        currency: data.currency || 'NGN',
        extendedPricing: data.extendedPricing || undefined,
        stock: data.stock || 0,
        sku: data.sku,
        categoryId: data.categoryId,
        images: data.images
          ? { create: data.images.map((url: string, i: number) => ({ url, sortOrder: i })) }
          : undefined,
        variants: data.variants
          ? { create: data.variants.map((v: any) => ({ ...v })) }
          : undefined,
      },
      include: { images: true, variants: true },
    });
  }

  async getProducts(tenantId: string, query: any) {
    const where: any = { tenantId, isActive: true };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
    if (query.type) where.type = query.type;
    if (query.minPrice) where.price = { ...where.price, gte: parseFloat(query.minPrice) };
    if (query.maxPrice) where.price = { ...where.price, lte: parseFloat(query.maxPrice) };

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          images: { orderBy: { sortOrder: 'asc' } },
          category: { select: { id: true, name: true, slug: true } },
          variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        },
        skip,
        take: limit,
        orderBy: query.sort === 'price_asc' ? { price: 'asc' }
          : query.sort === 'price_desc' ? { price: 'desc' }
          : query.sort === 'name' ? { name: 'asc' }
          : { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getProductsByType(tenantId: string, type: string, query: any) {
    return this.getProducts(tenantId, { ...query, type });
  }

  async getProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { images: true, category: true, variants: { where: { isActive: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async updateProduct(productId: string, data: any) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    if (data.type && !this.PRODUCT_TYPES.includes(data.type)) {
      throw new BadRequestException(`Invalid product type. Must be one of: ${this.PRODUCT_TYPES.join(', ')}`);
    }

    const { images, variants, ...productData } = data;

    if (images) {
      await this.prisma.productImage.deleteMany({ where: { productId } });
      await this.prisma.productImage.createMany({
        data: images.map((url: string, i: number) => ({ productId, url, sortOrder: i })),
      });
    }

    if (variants) {
      await this.prisma.productVariant.deleteMany({ where: { productId } });
      await this.prisma.productVariant.createMany({
        data: variants.map((v: any) => ({ productId, ...v })),
      });
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: productData,
      include: { images: true, variants: true },
    });
  }

  async deleteProduct(productId: string) {
    await this.prisma.product.update({ where: { id: productId }, data: { isActive: false } });
    return { message: 'Product deleted' };
  }

  async getProductTypes() {
    return this.PRODUCT_TYPES;
  }

  // ─── Multi-Currency Pricing ────────────────────

  async setExtendedPricing(productId: string, pricing: Record<string, { price: number; compareAtPrice?: number }>) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    return this.prisma.product.update({
      where: { id: productId },
      data: { extendedPricing: pricing as any },
    });
  }

  async getPriceInCurrency(productId: string, targetCurrency: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    if (product.currency === targetCurrency) {
      return { currency: targetCurrency, price: product.price, compareAtPrice: product.compareAtPrice };
    }

    const extPricing = product.extendedPricing as Record<string, { price: number; compareAtPrice?: number }> | null;
    if (extPricing?.[targetCurrency]) {
      return { currency: targetCurrency, ...extPricing[targetCurrency] };
    }

    return { currency: product.currency, price: product.price, compareAtPrice: product.compareAtPrice };
  }

  // ─── Inventory Management ──────────────────────

  async getAvailableStock(productId: string, variantId?: string): Promise<{ total: number; reserved: number; available: number }> {
    if (variantId) {
      const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
      if (!variant) throw new NotFoundException('Variant not found');
      const available = variant.stock - variant.reservedStock;
      return { total: variant.stock, reserved: variant.reservedStock, available: Math.max(0, available) };
    }

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    const available = product.stock - product.reservedStock;
    return { total: product.stock, reserved: product.reservedStock, available: Math.max(0, available) };
  }

  async reserveInventory(
    productId: string,
    quantity: number,
    variantId?: string,
    sessionId?: string,
    userId?: string,
    ttlMinutes = 15,
  ) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    const stockInfo = await this.getAvailableStock(productId, variantId);
    if (stockInfo.available < quantity) {
      throw new BadRequestException(`Insufficient stock. Available: ${stockInfo.available}, requested: ${quantity}`);
    }

    const reservation = await this.prisma.inventoryReservation.create({
      data: {
        tenantId: product.tenantId,
        productId,
        variantId,
        quantity,
        sessionId,
        userId,
        expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
      },
    });

    if (variantId) {
      await this.prisma.productVariant.update({
        where: { id: variantId },
        data: { reservedStock: { increment: quantity } },
      });
    } else {
      await this.prisma.product.update({
        where: { id: productId },
        data: { reservedStock: { increment: quantity } },
      });
    }

    return reservation;
  }

  async releaseReservation(reservationId: string) {
    const reservation = await this.prisma.inventoryReservation.findUnique({ where: { id: reservationId } });
    if (!reservation || reservation.status !== 'active') return { message: 'Reservation already released' };

    if (reservation.variantId) {
      await this.prisma.productVariant.update({
        where: { id: reservation.variantId },
        data: { reservedStock: { decrement: reservation.quantity } },
      });
    } else {
      await this.prisma.product.update({
        where: { id: reservation.productId },
        data: { reservedStock: { decrement: reservation.quantity } },
      });
    }

    await this.prisma.inventoryReservation.update({
      where: { id: reservationId },
      data: { status: 'released' },
    });

    return { message: 'Reservation released' };
  }

  async confirmReservation(reservationId: string) {
    const reservation = await this.prisma.inventoryReservation.findUnique({ where: { id: reservationId } });
    if (!reservation) throw new NotFoundException('Reservation not found');

    if (reservation.variantId) {
      await this.prisma.productVariant.update({
        where: { id: reservation.variantId },
        data: {
          stock: { decrement: reservation.quantity },
          reservedStock: { decrement: reservation.quantity },
        },
      });
    } else {
      await this.prisma.product.update({
        where: { id: reservation.productId },
        data: {
          stock: { decrement: reservation.quantity },
          reservedStock: { decrement: reservation.quantity },
        },
      });
    }

    await this.prisma.inventoryReservation.update({
      where: { id: reservationId },
      data: { status: 'confirmed' },
    });

    return { message: 'Reservation confirmed, inventory deducted' };
  }

  async adjustStock(productId: string, delta: number, variantId?: string) {
    if (variantId) {
      const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
      if (!variant) throw new NotFoundException('Variant not found');
      const newStock = variant.stock + delta;
      if (newStock < 0) throw new BadRequestException('Insufficient stock');
      return this.prisma.productVariant.update({ where: { id: variantId }, data: { stock: newStock } });
    }

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    const newStock = product.stock + delta;
    if (newStock < 0) throw new BadRequestException('Insufficient stock');
    return this.prisma.product.update({ where: { id: productId }, data: { stock: newStock } });
  }

  // ─── Product Variants ─────────────────────────

  async createVariant(productId: string, data: any) {
    return this.prisma.productVariant.create({ data: { productId, ...data } });
  }

  async updateVariant(variantId: string, data: any) {
    const v = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!v) throw new NotFoundException('Variant not found');
    return this.prisma.productVariant.update({ where: { id: variantId }, data });
  }

  async deleteVariant(variantId: string) {
    await this.prisma.productVariant.update({ where: { id: variantId }, data: { isActive: false } });
    return { message: 'Variant deleted' };
  }

  // ─── Cart Engine ──────────────────────────────

  async getOrCreateCart(tenantId: string, userId?: string, sessionId?: string) {
    const where: any = { tenantId };
    if (userId) where.userId = userId;
    else if (sessionId) where.sessionId = sessionId;
    else throw new BadRequestException('userId or sessionId required');

    let cart = await this.prisma.cart.findFirst({
      where: { ...where, expiresAt: null },
      include: { items: true },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { tenantId, userId, sessionId },
        include: { items: true },
      });
    }

    return cart;
  }

  async addToCart(cartId: string, productId: string, quantity: number, variantId?: string) {
    const cart = await this.prisma.cart.findUnique({ where: { id: cartId } });
    if (!cart) throw new NotFoundException('Cart not found');

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    let unitPrice = product.price.toNumber();

    const stockInfo = await this.getAvailableStock(productId, variantId);
    if (stockInfo.available < quantity) {
      throw new BadRequestException(`Insufficient stock. Available: ${stockInfo.available}, requested: ${quantity}`);
    }

    if (variantId) {
      const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
      if (!variant) throw new NotFoundException('Variant not found');
      unitPrice = variant.price.toNumber();
    }

    const existingItem = await this.prisma.cartItem.findFirst({
      where: { cartId, productId, variantId },
    });

    if (existingItem) {
      const newQty = existingItem.quantity + quantity;
      if (newQty > stockInfo.available) throw new BadRequestException('Insufficient stock');
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQty, totalPrice: unitPrice * newQty },
      });
    } else {
      await this.prisma.cartItem.create({
        data: { cartId, productId, variantId, quantity, unitPrice, totalPrice: unitPrice * quantity },
      });
    }

    await this.reserveInventory(productId, quantity, variantId, cart.sessionId || undefined, cart.userId || undefined);

    return this.recalculateCart(cartId);
  }

  async updateCartItem(cartItemId: string, quantity: number) {
    const item = await this.prisma.cartItem.findUnique({ where: { id: cartItemId } });
    if (!item) throw new NotFoundException('Cart item not found');

    if (quantity <= 0) {
      await this.prisma.cartItem.delete({ where: { id: cartItemId } });
    } else {
      await this.prisma.cartItem.update({
        where: { id: cartItemId },
        data: { quantity, totalPrice: item.unitPrice.toNumber() * quantity },
      });
    }

    return this.recalculateCart(item.cartId);
  }

  async removeFromCart(cartItemId: string) {
    const item = await this.prisma.cartItem.findUnique({ where: { id: cartItemId } });
    if (!item) throw new NotFoundException('Cart item not found');
    await this.prisma.cartItem.delete({ where: { id: cartItemId } });
    return this.recalculateCart(item.cartId);
  }

  async applyCoupon(cartId: string, couponCode: string) {
    const cart = await this.prisma.cart.findUnique({ where: { id: cartId } });
    if (!cart) throw new NotFoundException('Cart not found');

    const coupon = await this.prisma.coupon.findUnique({
      where: { tenantId_code: { tenantId: cart.tenantId, code: couponCode } },
    });
    if (!coupon || !coupon.isActive) throw new BadRequestException('Invalid or expired coupon');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new BadRequestException('Coupon expired');
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) throw new BadRequestException('Coupon usage limit reached');
    if (coupon.minSpend && cart.subtotal.toNumber() < coupon.minSpend.toNumber()) {
      throw new BadRequestException(`Minimum spend of ${coupon.minSpend} required`);
    }

    await this.prisma.cart.update({ where: { id: cartId }, data: { couponCode } });
    return this.recalculateCart(cartId);
  }

  async removeCoupon(cartId: string) {
    await this.prisma.cart.update({ where: { id: cartId }, data: { couponCode: null } });
    return this.recalculateCart(cartId);
  }

  async getCart(cartId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: {
        items: {
          include: { product: { select: { id: true, name: true, slug: true, images: { take: 1 } } } },
        },
      },
    });
    if (!cart) throw new NotFoundException('Cart not found');
    return cart;
  }

  private async recalculateCart(cartId: string) {
    const items = await this.prisma.cartItem.findMany({ where: { cartId } });
    const subtotal = items.reduce((sum, i) => sum + i.totalPrice.toNumber(), 0);

    const cart = await this.prisma.cart.findUnique({ where: { id: cartId }, include: { items: true } });
    if (!cart) throw new NotFoundException('Cart not found');

    let discountTotal = 0;
    if (cart.couponCode) {
      const coupon = await this.prisma.coupon.findUnique({
        where: { tenantId_code: { tenantId: cart.tenantId, code: cart.couponCode } },
      });
      if (coupon && coupon.isActive) {
        discountTotal = coupon.type === 'percentage'
          ? subtotal * (coupon.value.toNumber() / 100)
          : Math.min(coupon.value.toNumber(), subtotal);
      }
    }

    const total = subtotal - discountTotal;
    return this.prisma.cart.update({
      where: { id: cartId },
      data: { subtotal, total: Math.max(total, 0) },
      include: { items: true },
    });
  }

  // ─── Checkout → Order ─────────────────────────

  async checkout(cartId: string, customerData: { customerName?: string; customerEmail?: string; customerPhone?: string; notes?: string }) {
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: { items: true },
    });
    if (!cart) throw new NotFoundException('Cart not found');
    if (cart.items.length === 0) throw new BadRequestException('Cart is empty');

    const orderItems = cart.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      name: '',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    }));

    const order = await this.prisma.order.create({
      data: {
        tenantId: cart.tenantId,
        userId: cart.userId,
        customerName: customerData.customerName,
        customerEmail: customerData.customerEmail,
        customerPhone: customerData.customerPhone,
        couponCode: cart.couponCode,
        items: orderItems as any,
        subtotal: cart.subtotal,
        total: cart.total,
        notes: customerData.notes,
        status: 'pending_payment',
        orderItems: {
          create: orderItems,
        },
        statusHistory: {
          create: { to: 'pending_payment' },
        },
      },
      include: { orderItems: true },
    });

    await this.prisma.cart.update({ where: { id: cartId }, data: { expiresAt: new Date() } });

    if (cart.couponCode) {
      await this.prisma.coupon.updateMany({
        where: { tenantId: cart.tenantId, code: cart.couponCode },
        data: { usedCount: { increment: 1 } },
      });
    }

    await this.eventBus.publish({
      type: 'OrderCreated',
      aggregateId: order.id,
      data: { orderId: order.id, tenantId: cart.tenantId, total: cart.total, items: orderItems.length },
    });

    this.logger.log(`Order ${order.id} created from cart ${cartId}`);
    return order;
  }

  // ─── Orders ───────────────────────────────────

  async getOrders(tenantId: string, query: any) {
    const where: any = { tenantId };
    if (query.status) where.status = query.status;
    if (query.userId) where.userId = query.userId;

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { orderItems: true, statusHistory: { orderBy: { createdAt: 'desc' }, take: 5 } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true, statusHistory: { orderBy: { createdAt: 'asc' } }, fulfillments: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateOrderStatus(orderId: string, status: string, reason?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const validTransitions: Record<string, string[]> = {
      pending_payment: ['paid', 'cancelled'],
      paid: ['processing', 'refunded'],
      processing: ['shipped', 'ready_for_pickup', 'cancelled'],
      shipped: ['delivered', 'cancelled'],
      ready_for_pickup: ['completed', 'cancelled'],
      delivered: ['completed'],
      completed: ['refunded'],
      cancelled: [],
      refunded: [],
    };

    const allowed = validTransitions[order.status] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Cannot transition from ${order.status} to ${status}`);
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        ...(status === 'paid' ? { paidAt: new Date(), paymentStatus: 'paid' } : {}),
        ...(status === 'delivered' || status === 'completed' ? { fulfilledAt: new Date() } : {}),
        statusHistory: {
          create: { from: order.status, to: status, reason, changedBy: 'system' },
        },
      },
      include: { statusHistory: { orderBy: { createdAt: 'asc' } } },
    });

    await this.eventBus.publish({
      type: 'OrderStatusChanged',
      aggregateId: orderId,
      data: { orderId, from: order.status, to: status },
    });

    return updated;
  }

  // ─── Coupons ──────────────────────────────────

  async createCoupon(tenantId: string, data: any) {
    return this.prisma.coupon.create({ data: { tenantId, ...data } });
  }

  async getCoupons(tenantId: string) {
    return this.prisma.coupon.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateCoupon(couponId: string, data: any) {
    const c = await this.prisma.coupon.findUnique({ where: { id: couponId } });
    if (!c) throw new NotFoundException('Coupon not found');
    return this.prisma.coupon.update({ where: { id: couponId }, data });
  }

  async deleteCoupon(couponId: string) {
    await this.prisma.coupon.update({ where: { id: couponId }, data: { isActive: false } });
    return { message: 'Coupon deleted' };
  }

  // ─── Fulfillments ─────────────────────────────

  async createFulfillment(orderId: string, data: any) {
    return this.prisma.fulfillment.create({ data: { orderId, ...data } });
  }

  async getFulfillments(orderId: string) {
    return this.prisma.fulfillment.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' } });
  }

  async updateFulfillment(fulfillmentId: string, data: any) {
    const f = await this.prisma.fulfillment.findUnique({ where: { id: fulfillmentId } });
    if (!f) throw new NotFoundException('Fulfillment not found');
    const updated = await this.prisma.fulfillment.update({ where: { id: fulfillmentId }, data });
    if (data.status === 'completed') {
      await this.prisma.fulfillment.update({ where: { id: fulfillmentId }, data: { completedAt: new Date() } });
    }
    return updated;
  }

  // ─── Tax Rules ────────────────────────────────

  async createTaxRule(tenantId: string, data: any) {
    if (data.isDefault) {
      await this.prisma.taxRule.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.taxRule.create({ data: { tenantId, ...data } });
  }

  async getTaxRules(tenantId: string) {
    return this.prisma.taxRule.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  async updateTaxRule(taxRuleId: string, data: any) {
    const t = await this.prisma.taxRule.findUnique({ where: { id: taxRuleId } });
    if (!t) throw new NotFoundException('Tax rule not found');
    if (data.isDefault) {
      await this.prisma.taxRule.updateMany({
        where: { tenantId: t.tenantId, isDefault: true, id: { not: taxRuleId } },
        data: { isDefault: false },
      });
    }
    return this.prisma.taxRule.update({ where: { id: taxRuleId }, data });
  }

  async deleteTaxRule(taxRuleId: string) {
    const t = await this.prisma.taxRule.findUnique({ where: { id: taxRuleId } });
    if (!t) throw new NotFoundException('Tax rule not found');
    return this.prisma.taxRule.delete({ where: { id: taxRuleId } });
  }

  async calculateTax(tenantId: string, subtotal: number, region?: string) {
    const rules = await this.prisma.taxRule.findMany({
      where: { tenantId, ...(region ? { region } : {}), isActive: true },
    });
    if (rules.length === 0) return { taxTotal: 0, breakdown: [] };
    const rate = rules.reduce((max, r) => Math.max(max, r.rate.toNumber()), 0);
    const taxTotal = subtotal * (rate / 100);
    return { taxTotal: Math.round(taxTotal * 100) / 100, breakdown: rules.map((r) => ({ name: r.name, rate: r.rate.toNumber(), amount: Math.round(subtotal * (r.rate.toNumber() / 100) * 100) / 100 })) };
  }
}
