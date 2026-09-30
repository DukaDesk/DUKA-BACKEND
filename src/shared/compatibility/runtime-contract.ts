/**
 * B7 — machine-readable runtime compatibility contract.
 *
 * Single source of truth for what the published-app shell can render. Served
 * anonymously at GET /api/v1/compatibility, checked by merchant preflight and
 * enforced before release activation (never activate an app the shell cannot
 * render).
 *
 * Every catalog entry is evidence-based:
 *  - components: builder component registry (component-registry.service.ts),
 *    component/section types actually stored in production (templates + installs),
 *    the KB shared fixture (mobile/fixtures/published-app.json) and the
 *    v0.0.7 shell registry named in the mobile reconstruction report.
 *  - actions: ActionBuilderService registered action types.
 *  - capabilities: platform capability ids (fixture declares `catalog`).
 */
export const RUNTIME_CONTRACT_ID = 'dukadesk.published-app-runtime';
export const RUNTIME_CONTRACT_VERSION = '1.0.0';
export const RUNTIME_SHELL_ID = 'dukadesk-mobile-shell';
export const RUNTIME_SHELL_MIN_VERSION = '1.0.0';

export const SUPPORTED_MANIFEST_VERSIONS = ['1.0.0', '1.0'] as const;

/** Component + section node types the shell can render. Unknown → reject. */
export const SUPPORTED_COMPONENT_TYPES: readonly string[] = [
  // Builder component registry
  'button',
  'carousel',
  'divider',
  'form',
  'header',
  'image',
  'map',
  'product_grid',
  'service_list',
  'spacer',
  'text_block',
  // Production templates (templates.config / components / sections tables)
  'CategoryGrid',
  'ContactForm',
  'HeroBanner',
  'ProductCarousel',
  'ProductGrid',
  'grid',
  'hero',
  'text',
  // KB shared fixture (mobile/fixtures/published-app.json)
  'heading',
  'layout',
  'surface',
  'tab_bar',
  'tabs',
  // Structural layout containers emitted by the merchant canvas (row/column
  // split layouts). Rendered as flex containers by every shell.
  'row',
  'column',
  // Mobile v0.0.7 shell registry (KB reconstruction report 2026-09-19)
  'category_pills',
  'cart_summary',
  'hero_banner',
  'info_list',
  'menu_grid',
  'order_history',
  'primary_button',
  'promotion_list',
  'section_header',
  // Rendered directly by mobile ComponentRegistry.tsx.
  'secondary_button', 'icon_button', 'link', 'fab', 'card_container',
  'rectangle', 'ellipse', 'gap', 'nested_section',
  // Registered native components in mobile src/components/register.ts.
  'caption',
  'badge',
  'tag',
  'alert',
  'loading_indicator',
  'empty_state',
  'error_state',
  'skeleton_loader',
  'progress_bar',
  'snackbar',
  'price_label',
  'discount_badge',
  'quantity_selector',
  'coupon_input',
  'product_card',
  'text_input',
  'password_input',
  'checkbox',
  'radio_button',
  'toggle_switch',
  'dropdown',
  'search_box',
  'otp_input',
  'page_header',
  'avatar',
  'app_image',
  'qr_code',
  'bottom_sheet',
  'statistic_card',
  'status_badge',
  'rating',
  'key_value_list',
  'vertical_list',
  'horizontal_list',
  'expandable_list',
  'notification_list',
  'dynamic_form',
  'order_detail',
  'report_action',
  'cart_content',
  'address_form',
  'calendar_strip',
  'slot_grid',
  'service_picker',
  'booking_card',
  'booking_summary',
  // Shell overlay/modal nodes (KB: overlays preserve props/actions)
  'modal',
  'overlay',
];

/** Action types registered in ActionBuilderService. Unknown → warn (reported). */
export const SUPPORTED_ACTION_TYPES: readonly string[] = [
  'add_to_cart',
  'api_call',
  'api_request',
  'submit_form',
  'book_service',
  'call_phone',
  'navigate',
  'open_form',
  'open_url',
  'scroll_to',
  'send_email',
  'share',
];

/** Platform capabilities. Required + unknown → block; optional + unknown → warn. */
export const SUPPORTED_CAPABILITIES: readonly string[] = [
  'analytics',
  'auth',
  'booking',
  'cart',
  'catalog',
  'checkout',
  'commerce',
  'forms',
  'localization',
  'media',
  'notifications',
  'orders',
  'payments',
  'profile',
  'qr',
  'search',
];

/** How an asset reference is resolved by the shell. */
export const ASSET_REFERENCE_KINDS = [
  'media-id',
  'absolute-url',
  'relative-path',
  'data-url',
] as const;

export const RUNTIME_LIMITS = {
  maxScreens: 200,
  maxNestingDepth: 25,
  maxComponents: 2000,
  maxAssetReferences: 500,
} as const;

export const COMPATIBILITY_POLICIES = {
  unknownComponent: 'reject',
  unknownAction: 'warn',
  requiredCapability: 'reject',
  optionalCapability: 'warn',
  unresolvableAsset: 'reject',
  limits: 'reject',
} as const;

export interface RuntimeContract {
  contract: string;
  contractVersion: string;
  generatedAt: string;
  shell: { id: string; minVersion: string };
  manifest: {
    versions: readonly string[];
    screenModel: string;
    unsupportedVersionPolicy: 'reject';
  };
  components: { supported: readonly string[]; count: number; unknownPolicy: 'reject' };
  actions: { supported: readonly string[]; count: number; unknownPolicy: 'warn' };
  capabilities: {
    supported: readonly string[];
    requiredUnknownPolicy: 'reject';
    optionalUnknownPolicy: 'warn';
  };
  assets: { referenceKinds: readonly string[]; unresolvablePolicy: 'reject' };
  limits: typeof RUNTIME_LIMITS;
  preflight: { method: string; path: string };
}

const CONTRACT: RuntimeContract = {
  contract: RUNTIME_CONTRACT_ID,
  contractVersion: RUNTIME_CONTRACT_VERSION,
  generatedAt: new Date().toISOString(),
  shell: { id: RUNTIME_SHELL_ID, minVersion: RUNTIME_SHELL_MIN_VERSION },
  manifest: {
    versions: SUPPORTED_MANIFEST_VERSIONS,
    screenModel: 'object-map|array',
    unsupportedVersionPolicy: 'reject',
  },
  components: {
    supported: SUPPORTED_COMPONENT_TYPES,
    count: SUPPORTED_COMPONENT_TYPES.length,
    unknownPolicy: 'reject',
  },
  actions: {
    supported: SUPPORTED_ACTION_TYPES,
    count: SUPPORTED_ACTION_TYPES.length,
    unknownPolicy: 'warn',
  },
  capabilities: {
    supported: SUPPORTED_CAPABILITIES,
    requiredUnknownPolicy: 'reject',
    optionalUnknownPolicy: 'warn',
  },
  assets: { referenceKinds: ASSET_REFERENCE_KINDS, unresolvablePolicy: 'reject' },
  limits: RUNTIME_LIMITS,
  preflight: {
    method: 'POST',
    path: '/api/v1/merchants/{tenantId}/publishing/preflight',
  },
};

export function buildRuntimeContract(): RuntimeContract {
  return CONTRACT;
}
