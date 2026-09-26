import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserRole } from '../../users/entities/user.entity';
import { CreateManagedUserDto } from './admin.dto';

const basePayload = {
  full_name: 'Test User',
  email: 'test.user@example.com',
  password: 'SecurePass123',
  phone_number: '+201015433123',
};

describe('CreateManagedUserDto', () => {
  it('does not validate or retain student-only fields for instructors', async () => {
    const dto = plainToInstance(CreateManagedUserDto, {
      ...basePayload,
      role: UserRole.INSTRUCTOR,
      student_number: '',
      current_semester: 1,
      specialization: 'Cardiology',
      office_location: '',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.student_number).toBeUndefined();
    expect(dto.current_semester).toBeUndefined();
    expect(dto.specialization).toBe('Cardiology');
  });

  it('does not validate or retain student-only fields for administrators', async () => {
    const dto = plainToInstance(CreateManagedUserDto, {
      ...basePayload,
      email: 'admin@example.com',
      phone_number: '+201015433124',
      role: UserRole.SYSTEM_ADMIN,
      student_number: '',
      current_semester: 1,
      employee_number: 'ADM-001',
      is_super_admin: false,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.student_number).toBeUndefined();
    expect(dto.current_semester).toBeUndefined();
    expect(dto.employee_number).toBe('ADM-001');
  });

  it('requires student number and semester for student accounts', async () => {
    const dto = plainToInstance(CreateManagedUserDto, {
      ...basePayload,
      email: 'student@example.com',
      phone_number: '+201015433125',
      role: UserRole.STUDENT,
    });

    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toContain('student_number');
    expect(properties).toContain('current_semester');
  });

  it('returns a readable uppercase-password validation message', async () => {
    const dto = plainToInstance(CreateManagedUserDto, {
      ...basePayload,
      email: 'instructor2@example.com',
      phone_number: '+201015433126',
      password: 'securepass123',
      role: UserRole.INSTRUCTOR,
    });

    const errors = await validate(dto);
    const passwordError = errors.find((error) => error.property === 'password');

    expect(Object.values(passwordError?.constraints ?? {})).toContain(
      'password must contain at least one uppercase letter',
    );
  });
});
