import { UsersService } from './users.service';
describe('Two approved student devices', () => {
  function fixture(active = 1) {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM device_access_requests')) return [{ id:'request', client_device_id:'new', proposed_public_key_jwk:{}, status:'PENDING' }];
      if (sql.includes("status='ACTIVE' AND client_device_id<>")) return Array.from({length:active},(_,i)=>({id:String(i)}));
      if (sql.includes('INSERT INTO trusted_devices')) return [{id:'second'}];
      return [];
    });
    const service = new UsersService({} as any,{} as any,{} as any,{} as any,{} as any,{transaction:async cb=>cb({query})} as any);
    return {service,query};
  }
  it('adds the second device without revoking the other device or its sessions', async () => {
    const {service,query}=fixture();
    await service.approveDeviceAccessRequest('user','request','admin',true);
    expect(query.mock.calls.some(([sql])=>sql.includes('max_active_devices=2'))).toBe(true);
    expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE trusted_devices SET status'))).toBe(false);
    expect(query.mock.calls.filter(([sql])=>sql.startsWith('UPDATE auth_sessions')).every(([sql])=>sql.includes('trusted_device_id IN'))).toBe(true);
  });
  it('blocks approval of a third device before increasing capacity or inserting it', async () => {
    const {service,query}=fixture(2);
    await expect(service.approveDeviceAccessRequest('user','request','admin',true)).rejects.toThrow('Two devices');
    expect(query.mock.calls.some(([sql])=>sql.includes('INSERT INTO trusted_devices'))).toBe(false);
  });
  it('replacement revokes existing devices and restores the one-device policy', async () => {
    const {service,query}=fixture();
    await service.approveDeviceAccessRequest('user','request','admin');
    expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE trusted_devices SET status'))).toBe(true);
    expect(query.mock.calls.some(([sql])=>sql.includes('max_active_devices=1'))).toBe(true);
  });
  it.each([[1,1,true],[2,1,false],[2,2,true]])('capacity %i with %i sessions blocks=%s', async (limit,count,blocked) => {
    const builder={where:jest.fn().mockReturnThis(),andWhere:jest.fn().mockReturnThis(),getCount:jest.fn().mockResolvedValue(count)};
    const service=new UsersService({} as any,{} as any,{} as any,{} as any,{createQueryBuilder:()=>builder} as any,{query:async()=>[{max_active_devices:limit}]} as any);
    expect(await service.hasActiveSession('user')).toBe(blocked);
  });
});
