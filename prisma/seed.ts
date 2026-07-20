import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed RBAC: Platform Roles
  const platformRoles = [
    { name: 'super_admin', description: 'Full platform access', isSystem: true },
    { name: 'support', description: 'Customer support access', isSystem: true },
    { name: 'operations', description: 'Platform operations', isSystem: true },
    { name: 'finance', description: 'Financial reports access', isSystem: true },
  ];

  const permissions = [
    { name: 'tenant:create', resource: 'tenant', action: 'create' },
    { name: 'tenant:read', resource: 'tenant', action: 'read' },
    { name: 'tenant:update', resource: 'tenant', action: 'update' },
    { name: 'tenant:delete', resource: 'tenant', action: 'delete' },
    { name: 'tenant:publish', resource: 'tenant', action: 'publish' },
    { name: 'tenant:suspend', resource: 'tenant', action: 'suspend' },
    { name: 'tenant:approve', resource: 'tenant', action: 'approve' },
    { name: 'user:read', resource: 'user', action: 'read' },
    { name: 'user:update', resource: 'user', action: 'update' },
    { name: 'user:delete', resource: 'user', action: 'delete' },
    { name: 'product:create', resource: 'product', action: 'create' },
    { name: 'product:read', resource: 'product', action: 'read' },
    { name: 'product:update', resource: 'product', action: 'update' },
    { name: 'product:delete', resource: 'product', action: 'delete' },
    { name: 'order:read', resource: 'order', action: 'read' },
    { name: 'order:update', resource: 'order', action: 'update' },
    { name: 'payment:read', resource: 'payment', action: 'read' },
    { name: 'analytics:read', resource: 'analytics', action: 'read' },
    { name: 'settings:read', resource: 'settings', action: 'read' },
    { name: 'settings:update', resource: 'settings', action: 'update' },
  ];

  for (const role of platformRoles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: role,
      create: role,
    });
  }

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: perm,
      create: perm,
    });
  }

  // Assign all permissions to super_admin
  const superAdminRole = await prisma.role.findUnique({ where: { name: 'super_admin' } });
  if (superAdminRole) {
    for (const perm of permissions) {
      const p = await prisma.permission.findUnique({ where: { name: perm.name } });
      if (p) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: p.id } },
          update: {},
          create: { roleId: superAdminRole.id, permissionId: p.id },
        });
      }
    }
  }

  // Seed starter subscription plans
  const plans = [
    {
      name: 'Starter',
      slug: 'starter',
      price: 0,
      features: { commerce: true, forms: true, notifications: true, booking: false, analytics: false, integrations: false, custom_domain: false },
      limits: { products: 20, pages: 5, staff: 2, storage: 100, bandwidth: 1000 },
    },
    {
      name: 'Business',
      slug: 'business',
      price: 29.99,
      features: { commerce: true, forms: true, notifications: true, booking: true, analytics: true, integrations: true, custom_domain: false },
      limits: { products: 200, pages: 20, staff: 10, storage: 1000, bandwidth: 10000 },
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      price: 99.99,
      features: { commerce: true, forms: true, notifications: true, booking: true, analytics: true, integrations: true, custom_domain: true, sso: true, multi_workspace: true },
      limits: { products: -1, pages: -1, staff: -1, storage: 10000, bandwidth: -1 },
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan,
    });
  }

  // Seed supported payment providers
  const providers = [
    { name: 'Flutterwave', slug: 'flutterwave' },
    { name: 'Paystack', slug: 'paystack' },
    { name: 'Stripe', slug: 'stripe' },
  ];

  for (const provider of providers) {
    await prisma.paymentProvider.upsert({
      where: { slug: provider.slug },
      update: provider,
      create: provider,
    });
  }

  const templates = [
    {
      name: 'Modern Store',
      slug: 'modern-store',
      description: 'A modern e-commerce store with product grid, hero banner, and featured categories.',
      category: 'commerce',
      thumbnail: '/templates/modern-store.png',
      config: {
        pages: [
          {
            name: 'Home',
            slug: 'home',
            isHome: true,
            sortOrder: 0,
            sections: [
              {
                type: 'hero',
                sortOrder: 0,
                config: { fullWidth: true, height: 400 },
                components: [
                  {
                    type: 'HeroBanner',
                    sortOrder: 0,
                    props: {
                      title: 'Welcome to Our Store',
                      subtitle: 'Discover amazing products at great prices',
                      backgroundImage: '',
                      cta: { label: 'Shop Now', action: 'navigate', target: '/products' },
                      alignment: 'center',
                    },
                  },
                ],
              },
              {
                type: 'grid',
                sortOrder: 1,
                config: { columns: 2 },
                components: [
                  { type: 'CategoryGrid', sortOrder: 0, props: { title: 'Shop by Category' } },
                ],
              },
              {
                type: 'carousel',
                sortOrder: 2,
                config: { autoplay: true },
                components: [
                  { type: 'ProductCarousel', sortOrder: 0, props: { title: 'Featured Products', limit: 10 } },
                ],
              },
              {
                type: 'grid',
                sortOrder: 3,
                config: { columns: 3 },
                components: [
                  { type: 'ProductGrid', sortOrder: 0, props: { title: 'Best Sellers', limit: 6 } },
                ],
              },
            ],
          },
          {
            name: 'Products',
            slug: 'products',
            isHome: false,
            sortOrder: 1,
            sections: [
              {
                type: 'grid',
                sortOrder: 0,
                config: { columns: 2 },
                components: [
                  { type: 'ProductGrid', sortOrder: 0, props: { limit: 20 } },
                ],
              },
            ],
          },
          {
            name: 'About',
            slug: 'about',
            isHome: false,
            sortOrder: 2,
            sections: [
              {
                type: 'text',
                sortOrder: 0,
                config: {},
                components: [
                  {
                    type: 'ContactForm',
                    sortOrder: 0,
                    props: { title: 'Get in Touch', email: 'info@store.com' },
                  },
                ],
              },
            ],
          },
        ],
        navigation: [
          { label: 'Home', action: 'navigate', target: '/home', icon: 'home' },
          { label: 'Products', action: 'navigate', target: '/products', icon: 'shopping-bag' },
          { label: 'Cart', action: 'navigate', target: '/cart', icon: 'shopping-cart' },
          { label: 'About', action: 'navigate', target: '/about', icon: 'info' },
        ],
        theme: {
          primaryColor: '#0066FF',
          secondaryColor: '#00CC66',
          backgroundColor: '#FFFFFF',
          textColor: '#1A1A1A',
          fontFamily: 'Inter',
          borderRadius: '8px',
        },
      },
    },
    {
      name: 'Restaurant',
      slug: 'restaurant',
      description: 'Perfect for restaurants with menu display, online ordering, and reservation.',
      category: 'restaurant',
      thumbnail: '/templates/restaurant.png',
      config: {
        pages: [
          {
            name: 'Home',
            slug: 'home',
            isHome: true,
            sortOrder: 0,
            sections: [
              {
                type: 'hero',
                sortOrder: 0,
                components: [
                  {
                    type: 'HeroBanner',
                    sortOrder: 0,
                    props: {
                      title: 'Delicious Food',
                      subtitle: 'Order online and enjoy',
                      cta: { label: 'View Menu', action: 'navigate', target: '/menu' },
                    },
                  },
                ],
              },
              {
                type: 'grid',
                sortOrder: 1,
                components: [
                  { type: 'CategoryGrid', sortOrder: 0, props: { title: 'Our Menu' } },
                ],
              },
            ],
          },
          {
            name: 'Menu',
            slug: 'menu',
            isHome: false,
            sortOrder: 1,
            sections: [
              {
                type: 'grid',
                sortOrder: 0,
                components: [
                  { type: 'ProductGrid', sortOrder: 0, props: { title: 'Full Menu' } },
                ],
              },
            ],
          },
        ],
        navigation: [
          { label: 'Home', action: 'navigate', target: '/home', icon: 'home' },
          { label: 'Menu', action: 'navigate', target: '/menu', icon: 'book' },
          { label: 'Orders', action: 'navigate', target: '/orders', icon: 'clipboard' },
          { label: 'Contact', action: 'navigate', target: '/contact', icon: 'phone' },
        ],
        theme: {
          primaryColor: '#E53935',
          secondaryColor: '#FFB300',
          backgroundColor: '#FFF8E1',
          textColor: '#2D2D2D',
          fontFamily: 'Inter',
          borderRadius: '12px',
        },
      },
    },
    {
      name: 'Clinic',
      slug: 'clinic',
      description: 'Medical clinic template with appointment booking, services, and doctor profiles.',
      category: 'clinic',
      thumbnail: '/templates/clinic.png',
      config: {
        pages: [
          {
            name: 'Home',
            slug: 'home',
            isHome: true,
            sortOrder: 0,
            sections: [
              {
                type: 'hero',
                sortOrder: 0,
                components: [
                  {
                    type: 'HeroBanner',
                    sortOrder: 0,
                    props: {
                      title: 'Your Health Matters',
                      subtitle: 'Book an appointment today',
                      cta: { label: 'Book Now', action: 'navigate', target: '/appointments' },
                    },
                  },
                ],
              },
              {
                type: 'grid',
                sortOrder: 1,
                components: [
                  { type: 'ProductGrid', sortOrder: 0, props: { title: 'Our Services' } },
                ],
              },
            ],
          },
        ],
        navigation: [
          { label: 'Home', action: 'navigate', target: '/home', icon: 'home' },
          { label: 'Services', action: 'navigate', target: '/services', icon: 'activity' },
          { label: 'Book', action: 'navigate', target: '/appointments', icon: 'calendar' },
          { label: 'Contact', action: 'navigate', target: '/contact', icon: 'phone' },
        ],
        theme: {
          primaryColor: '#1976D2',
          secondaryColor: '#4FC3F7',
          backgroundColor: '#F5F8FF',
          textColor: '#1A1A2E',
          fontFamily: 'Inter',
          borderRadius: '8px',
        },
      },
    },
  ];

  for (const template of templates) {
    await prisma.template.upsert({
      where: { slug: template.slug },
      update: template,
      create: template,
    });
  }

  // ─── Sample Tenant & User Data ─────────────────────────────

  const sampleTenantSlug = 'acme-store';
  const existingTenant = await prisma.tenant.findUnique({ where: { slug: sampleTenantSlug } });

  if (!existingTenant) {
    const sampleUser = await prisma.user.upsert({
      where: { email: 'john@acme.com' },
      update: {},
      create: {
        email: 'john@acme.com',
        firstName: 'John',
        lastName: 'Acme',
        passwordHash: '$2a$12$LJ3m4ys3Lk0TSwHnbfOMiOXPm1QlqQ1y5e5y5e5y5e5y5e5y5e5y', // Password123!
        emailVerified: true,
      },
    });

    await prisma.profile.upsert({
      where: { userId: sampleUser.id },
      update: {},
      create: {
        userId: sampleUser.id,
        gender: 'male',
        country: 'NG',
        state: 'Lagos',
        city: 'Ikeja',
      },
    });

    const starterPlan = await prisma.plan.findUnique({ where: { slug: 'starter' } });

    const tenant = await prisma.tenant.create({
      data: {
        name: 'Acme Store',
        slug: sampleTenantSlug,
        email: 'store@acme.com',
        phone: '+2348012345678',
        status: 'published',
        publishedAt: new Date(),
      },
    });

    await prisma.tenantUser.create({
      data: {
        tenantId: tenant.id,
        userId: sampleUser.id,
        role: 'owner',
      },
    });

    await prisma.tenantConfig.create({
      data: {
        tenantId: tenant.id,
        currency: 'NGN',
        timezone: 'Africa/Lagos',
        region: 'NG',
      },
    });

    if (starterPlan) {
      await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: starterPlan.id,
          status: 'active',
          startDate: new Date(),
          autoRenew: true,
        },
      });
    }

    const modernTemplate = await prisma.template.findUnique({ where: { slug: 'modern-store' } });
    if (modernTemplate) {
      const config = modernTemplate.config as any;

      const theme = await prisma.theme.create({
        data: {
          tenantId: tenant.id,
          primaryColor: config.theme?.primaryColor || '#0066FF',
          secondaryColor: config.theme?.secondaryColor || '#00CC66',
          backgroundColor: config.theme?.backgroundColor || '#FFFFFF',
          textColor: config.theme?.textColor || '#1A1A1A',
          fontFamily: config.theme?.fontFamily || 'Inter',
          borderRadius: config.theme?.borderRadius || '8px',
        },
      });

      if (config.navigation) {
        await prisma.navigation.create({
          data: {
            tenantId: tenant.id,
            items: config.navigation,
          },
        });
      }

      if (config.pages) {
        for (const pageConfig of config.pages) {
          const page = await prisma.page.create({
            data: {
              tenantId: tenant.id,
              name: pageConfig.name,
              slug: pageConfig.slug,
              isHome: pageConfig.isHome || false,
              sortOrder: pageConfig.sortOrder || 0,
            },
          });

          if (pageConfig.sections) {
            for (const sectionConfig of pageConfig.sections) {
              const section = await prisma.section.create({
                data: {
                  pageId: page.id,
                  type: sectionConfig.type,
                  sortOrder: sectionConfig.sortOrder || 0,
                  config: sectionConfig.config || {},
                },
              });

              if (sectionConfig.components) {
                for (const compConfig of sectionConfig.components) {
                  await prisma.component.create({
                    data: {
                      sectionId: section.id,
                      type: compConfig.type,
                      sortOrder: compConfig.sortOrder || 0,
                      props: compConfig.props || {},
                    },
                  });
                }
              }
            }
          }
        }
      }
    }

    // Sample categories
    const categories = [
      { name: 'Electronics', slug: 'electronics', sortOrder: 0 },
      { name: 'Clothing', slug: 'clothing', sortOrder: 1 },
      { name: 'Accessories', slug: 'accessories', sortOrder: 2 },
    ];

    for (const cat of categories) {
      await prisma.category.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug: cat.slug } },
        update: {},
        create: { tenantId: tenant.id, ...cat },
      });
    }

    // Sample products
    const products = [
      { name: 'Wireless Headphones', slug: 'wireless-headphones', price: 29999, categorySlug: 'electronics', description: 'Premium wireless headphones with noise cancellation' },
      { name: 'Cotton T-Shirt', slug: 'cotton-tshirt', price: 4999, categorySlug: 'clothing', description: 'Comfortable 100% cotton t-shirt' },
      { name: 'Leather Watch', slug: 'leather-watch', price: 15999, categorySlug: 'accessories', description: 'Elegant leather strap watch' },
    ];

    for (const product of products) {
      const category = await prisma.category.findUnique({
        where: { tenantId_slug: { tenantId: tenant.id, slug: product.categorySlug } },
      });

      await prisma.product.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug: product.slug } },
        update: {},
        create: {
          tenantId: tenant.id,
          categoryId: category?.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          price: product.price,
          currency: 'NGN',
          stock: 100,
        },
      });
    }

    console.log(`Sample data created: tenant "${tenant.name}" with user john@acme.com`);
  } else {
    console.log('Sample data already exists, skipping...');
  }

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
