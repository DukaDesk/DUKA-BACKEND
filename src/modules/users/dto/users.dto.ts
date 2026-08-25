export class listUsersDto {
  page?: number;
  limit?: number;
  email?: string;
  role?: string;
  tenantId?: string;
  status?: string;
}

export class getUserByIdDto {
  id: string;
}

export class inviteUserDto {
  email: string;
  role?: string;
  tenantId?: string;
}

export class assignUserRolesDto {
  role: string;
  tenantId: string;
}

export class removeUserDto {
  userId: string;
  tenantId?: string;
}

export class getTenantUsersDto {
  page?: number;
  limit?: number;
}