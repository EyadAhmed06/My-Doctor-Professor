import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum PromoDiscountType {
  PERCENT = 'percent',
  FIXED = 'fixed',
  FREE = 'free',
}

@Entity('promo_codes')
export class PromoCode {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 50, unique: true }) code: string;
  @Column({ type: 'enum', enum: PromoDiscountType, enumName: 'promo_discount_type', name: 'discount_type' }) discountType: PromoDiscountType;
  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'discount_value', default: 0 }) discountValue: string;
  @Column({ type: 'int', name: 'max_uses', nullable: true }) maxUses: number | null;
  @Column({ type: 'int', name: 'used_count', default: 0 }) usedCount: number;
  @Column({ type: 'timestamp', name: 'expires_at', nullable: true }) expiresAt: Date | null;
  @Column({ type: 'boolean', name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
