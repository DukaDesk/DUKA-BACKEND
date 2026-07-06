import { Injectable } from '@nestjs/common';

export interface ThemeTokens {
  light: Record<string, string>;
  dark: Record<string, string>;
  typography?: Record<string, any>;
  spacing?: Record<string, any>;
  custom?: Record<string, any>;
}

export interface CompiledThemeBundle {
  tenantId: string;
  version: number;
  checksum: string;
  tokens: ThemeTokens;
}

@Injectable()
export class ThemeCompiler {
  compile(theme: any): CompiledThemeBundle {
    const tokens: ThemeTokens = {
      light: {
        primaryColor: theme.primaryColor,
        secondaryColor: theme.secondaryColor,
        backgroundColor: theme.backgroundColor,
        textColor: theme.textColor,
        fontFamily: theme.fontFamily,
        borderRadius: theme.borderRadius,
        ...(theme.logo ? { logo: theme.logo } : {}),
        ...(theme.favicon ? { favicon: theme.favicon } : {}),
      },
      dark: {
        primaryColor: theme.darkPrimaryColor,
        secondaryColor: theme.darkSecondaryColor,
        backgroundColor: theme.darkBackgroundColor,
        textColor: theme.darkTextColor,
        fontFamily: theme.fontFamily,
        borderRadius: theme.borderRadius,
        ...(theme.logo ? { logo: theme.logo } : {}),
      },
    };

    if (theme.typography) {
      tokens.typography = theme.typography;
    }

    if (theme.spacing) {
      tokens.spacing = theme.spacing;
    }

    if (theme.custom) {
      tokens.custom = theme.custom;
    }

    const raw = JSON.stringify(tokens);
    const checksum = this.simpleHash(raw);

    return {
      tenantId: theme.tenantId,
      version: theme.version,
      checksum,
      tokens,
    };
  }

  compileForPreview(theme: any): ThemeTokens {
    const bundle = this.compile(theme);
    return bundle.tokens;
  }

  private simpleHash(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}
