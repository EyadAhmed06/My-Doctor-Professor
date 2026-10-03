import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PromoCodePlan } from '../../common/entities/promo-code-plan.entity';
import { PromoCode, PromoDiscountType } from '../../common/entities/promo-code.entity';
import { CreatePromoCodeDto, UpdatePromoCodeDto } from './dtos/subscription.dto';

@Injectable()
export class PromoCodesService {
  constructor(
    @InjectRepository(PromoCode) private readonly codes: Repository<PromoCode>,
    @InjectRepository(PromoCodePlan) private readonly codePlans: Repository<PromoCodePlan>,
    private readonly dataSource: DataSource,
  ) {}

  listAll() {
    return this.codes.find({ order: { createdAt: 'DESC' } });
  }

  /** Validates the code is usable for this specific plan right now. Does NOT increment used_count —
   * that only happens once a purchase actually confirms as paid, so abandoned checkouts never burn a use. */
  async validateForPlan(code: string, planId: string): Promise<PromoCode> {
    const promo = await this.codes.findOne({ where: { code: code.trim().toUpperCase() } });
    if (!promo) throw new NotFoundException('Promo code not found');
    if (!promo.isActive) throw new BadRequestException('This promo code is not active');
    if (promo.expiresAt && promo.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('This promo code has expired');
    }
    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      throw new BadRequestException('This promo code has reached its usage limit');
    }
    const scopedRows = await this.codePlans.find({ where: { promoCodeId: promo.id } });
    if (scopedRows.length && !scopedRows.some((row) => row.planId === planId)) {
      throw new BadRequestException('This promo code does not apply to the selected plan');
    }
    return promo;
  }

  /** Rounded to cents; never negative regardless of discount size. */
  computeDiscountedPrice(basePrice: number, promo: PromoCode): number {
    if (promo.discountType === PromoDiscountType.FREE) return 0;
    const raw = promo.discountType === PromoDiscountType.PERCENT
      ? basePrice * (1 - Number(promo.discountValue) / 100)
      : basePrice - Number(promo.discountValue);
    return Math.max(0, Math.round(raw * 100) / 100);
  }

  async incrementUsage(promoId: string): Promise<void> {
    await this.codes.increment({ id: promoId }, 'usedCount', 1);
  }

  async create(dto: CreatePromoCodeDto): Promise<PromoCode> {
    const code = dto.code.trim().toUpperCase();
    if (await this.codes.findOne({ where: { code } })) {
      throw new ConflictException('A promo code with this code already exists');
    }
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(PromoCode, manager.create(PromoCode, {
        code,
        discountType: dto.discount_type,
        discountValue: dto.discount_value.toFixed(2),
        maxUses: dto.max_uses ?? null,
        expiresAt: dto.expires_at ? new Date(dto.expires_at) : null,
        isActive: dto.is_active ?? true,
      }));
      if (dto.applicable_plan_ids?.length) {
        await manager.save(PromoCodePlan, dto.applicable_plan_ids.map((planId) => manager.create(PromoCodePlan, { promoCodeId: saved.id, planId })));
      }
      return saved;
    });
  }

  async update(id: string, dto: UpdatePromoCodeDto): Promise<PromoCode> {
    const promo = await this.codes.findOne({ where: { id } });
    if (!promo) throw new NotFoundException('Promo code not found');
    if (dto.discount_type !== undefined) promo.discountType = dto.discount_type;
    if (dto.discount_value !== undefined) promo.discountValue = dto.discount_value.toFixed(2);
    if (dto.max_uses !== undefined) promo.maxUses = dto.max_uses;
    if (dto.expires_at !== undefined) promo.expiresAt = dto.expires_at ? new Date(dto.expires_at) : null;
    if (dto.is_active !== undefined) promo.isActive = dto.is_active;
    const saved = await this.codes.save(promo);
    if (dto.applicable_plan_ids !== undefined) {
      await this.dataSource.transaction(async (manager) => {
        await manager.delete(PromoCodePlan, { promoCodeId: id });
        if (dto.applicable_plan_ids!.length) {
          await manager.save(PromoCodePlan, dto.applicable_plan_ids!.map((planId) => manager.create(PromoCodePlan, { promoCodeId: id, planId })));
        }
      });
    }
    return saved;
  }
}
