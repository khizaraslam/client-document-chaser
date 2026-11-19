import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Public, SkipCsrf } from '../../common/decorators/auth.decorators';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterFirmDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './auth.dto';
import { AuthService, AuthTokenBundle } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterFirmDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.registerFirm(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
    this.setAuthCookies(res, result);
    return {
      ...result.me,
      emailDispatchStatus: result.emailDispatchStatus,
    };
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
    this.setAuthCookies(res, result);
    return result.me;
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.authService.refresh(
        req.cookies?.['cdc_refresh'] as string | undefined,
        req.ip,
        req.headers['user-agent'],
      );
      this.setAuthCookies(res, result);
      return result.me;
    } catch (error) {
      this.clearAuthCookies(res);
      throw error;
    }
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(
      req.cookies?.['cdc_refresh'] as string | undefined,
      undefined,
      req.ip,
    );
    this.clearAuthCookies(res);
    return { loggedOut: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout-all')
  async logoutAll(
    @CurrentAuth() auth: AuthenticatedContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(auth, req.ip);
    this.clearAuthCookies(res);
    return { loggedOutAll: true };
  }

  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  async resendVerification(@CurrentAuth() auth: AuthenticatedContext) {
    return this.authService.resendVerification(auth);
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.authService.resetPassword(dto, req.ip);
  }

  @Get('me')
  async me(@CurrentAuth() auth: AuthenticatedContext) {
    return this.authService.getMe(auth);
  }

  @Get('sessions')
  async listSessions(@CurrentAuth() auth: AuthenticatedContext) {
    return this.authService.listSessions(auth);
  }

  @Delete('sessions/:sessionId')
  async revokeSession(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    await this.authService.revokeSession(auth, sessionId);
    return { revoked: true };
  }

  private setAuthCookies(res: Response, bundle: AuthTokenBundle): void {
    const secure = this.configService.get<boolean>('COOKIE_SECURE', false);
    const domain = this.configService.get<string>('COOKIE_DOMAIN') || undefined;
    const ttlDays = this.configService.get<number>('REFRESH_TOKEN_TTL_DAYS', 30);

    res.cookie('cdc_access', bundle.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      domain,
      path: '/',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('cdc_refresh', bundle.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      domain,
      path: '/api/v1/auth',
      maxAge: ttlDays * 86_400_000,
    });

    res.cookie('cdc_csrf', bundle.csrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure,
      domain,
      path: '/',
      maxAge: ttlDays * 86_400_000,
    });
  }

  private clearAuthCookies(res: Response): void {
    const domain = this.configService.get<string>('COOKIE_DOMAIN') || undefined;
    res.clearCookie('cdc_access', { path: '/', domain });
    res.clearCookie('cdc_refresh', { path: '/api/v1/auth', domain });
    res.clearCookie('cdc_csrf', { path: '/', domain });
  }
}
