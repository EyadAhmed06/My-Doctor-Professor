import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserRole } from '../users/entities/user.entity';
import { ChangePasswordDto } from '../users/dtos/users.dto';
import { CreateManagedUserDto } from '../admin/dtos/admin.dto';
import { ResetPasswordDto } from './dtos/password-reset.dto';
import { SignupDto } from './dtos/signup.dto';

const validEightCharacterPassword = 'Abcdefg1';
const invalidSevenCharacterPassword = 'Abcdef1';

describe('Password policy', () => {
  it('accepts an 8-character password with upper, lower, and number for signup', async () => {
    const dto = plainToInstance(SignupDto, {
      full_name: 'Password Test',
      email: 'password.test@example.com',
      password: validEightCharacterPassword,
      phone_number: '+201015433127',
      role: UserRole.STUDENT,
      current_semester: 1,
      device_id: '2f127565-0708-4de8-b48d-a9b2bed7d132',
      device_public_key_jwk: {
        kty: 'EC',
        crv: 'P-256',
        x: 'test-x',
        y: 'test-y',
      },
      device_registration_signature: 'test-signature',
    });

    const errors = await validate(dto);
    expect(errors.find((error) => error.property === 'password')).toBeUndefined();
  });

  it('rejects a 7-character signup password', async () => {
    const dto = plainToInstance(SignupDto, {
      full_name: 'Password Test',
      email: 'password.test@example.com',
      password: invalidSevenCharacterPassword,
      phone_number: '+201015433127',
      role: UserRole.STUDENT,
      current_semester: 1,
      device_id: '2f127565-0708-4de8-b48d-a9b2bed7d132',
      device_public_key_jwk: {
        kty: 'EC',
        crv: 'P-256',
        x: 'test-x',
        y: 'test-y',
      },
      device_registration_signature: 'test-signature',
    });

    const errors = await validate(dto);
    expect(errors.find((error) => error.property === 'password')).toBeDefined();
  });

  it('uses the same 8-character minimum for password reset', async () => {
    const valid = plainToInstance(ResetPasswordDto, {
      token: 'valid-reset-token',
      new_password: validEightCharacterPassword,
      confirm_password: validEightCharacterPassword,
    });
    const invalid = plainToInstance(ResetPasswordDto, {
      token: 'valid-reset-token',
      new_password: invalidSevenCharacterPassword,
      confirm_password: invalidSevenCharacterPassword,
    });

    expect((await validate(valid)).find((error) => error.property === 'new_password')).toBeUndefined();
    expect((await validate(invalid)).find((error) => error.property === 'new_password')).toBeDefined();
  });

  it('uses the same 8-character minimum for in-account password changes', async () => {
    const valid = plainToInstance(ChangePasswordDto, {
      current_password: 'OldPassword1',
      new_password: validEightCharacterPassword,
    });
    const invalid = plainToInstance(ChangePasswordDto, {
      current_password: 'OldPassword1',
      new_password: invalidSevenCharacterPassword,
    });

    expect((await validate(valid)).find((error) => error.property === 'new_password')).toBeUndefined();
    expect((await validate(invalid)).find((error) => error.property === 'new_password')).toBeDefined();
  });

  it('uses the same 8-character minimum for administrator-created accounts', async () => {
    const valid = plainToInstance(CreateManagedUserDto, {
      full_name: 'Managed Instructor',
      email: 'managed@example.com',
      password: validEightCharacterPassword,
      phone_number: '+201015433128',
      role: UserRole.INSTRUCTOR,
    });
    const invalid = plainToInstance(CreateManagedUserDto, {
      full_name: 'Managed Instructor',
      email: 'managed2@example.com',
      password: invalidSevenCharacterPassword,
      phone_number: '+201015433129',
      role: UserRole.INSTRUCTOR,
    });

    expect((await validate(valid)).find((error) => error.property === 'password')).toBeUndefined();
    expect((await validate(invalid)).find((error) => error.property === 'password')).toBeDefined();
  });
});
