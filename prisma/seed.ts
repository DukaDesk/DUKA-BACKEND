import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
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

  console.log('Seed completed: 3 templates created');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
