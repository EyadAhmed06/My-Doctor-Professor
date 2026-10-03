import { QuestionsService } from './questions.service';
import { QuestionDifficulty } from '../../common/entities/question.entity';
import { UserRole } from '../users/entities/user.entity';

const actor = { userId: 'owner', role: UserRole.INSTRUCTOR } as any;
const dto = { expected_version: 3, question_text: 'Stem', explanation: 'General explanation', difficulty: QuestionDifficulty.MEDIUM, marks: 1, options: Array.from({length:5}, (_, index) => ({id:`choice-${index}`,option_text:`Choice ${index}`,is_correct:index===2,explanation:`Rationale ${index}`})) };
function fixture(version=3) {
 const query=jest.fn(async (sql:string) => sql.startsWith('SELECT * FROM questions') ? [{created_by:'owner',question_type:'MCQ',version,is_active:true}] : sql.startsWith('SELECT id, display_order') ? dto.options.map((option,index)=>({id:option.id,display_order:index+1})) : []);
 const transaction=jest.fn(async callback=>callback({query}));
 const service=new QuestionsService({findOne:jest.fn().mockResolvedValue({createdBy:'owner'})} as any,{} as any,{} as any,{} as any,{} as any,{} as any,{transaction} as any);
 return {service,query,transaction};
}
describe('Atomic MCQ editor',()=>{
 it('defers published shape checks until the complete MCQ and explanations are saved',async()=>{
  const {service,query,transaction}=fixture();
  await service.editMcq('question',dto,actor);
  expect(transaction).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][0]).toBe('SET CONSTRAINTS ALL DEFERRED');
  expect(query.mock.calls.at(-1)?.[0]).toBe('SET CONSTRAINTS ALL IMMEDIATE');
  const updates=query.mock.calls.filter(([sql])=>sql.startsWith('UPDATE mcq_options SET option_text='));
  expect(updates).toHaveLength(5);
  const final=query.mock.calls.find(([sql])=>sql.startsWith('UPDATE questions SET title='));
  expect((final as any)[1][3]).toBe(dto.explanation);
  expect((final as any)[1][6]).toBe(true);
 });
 it('rejects a stale editor without changing content',async()=>{
  const {service,query}=fixture(4);
  await expect(service.editMcq('question',dto,actor)).rejects.toThrow('changed since');
  expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
 });
 it('rejects choices from another question before writing',async()=>{
  const {service,query}=fixture();
  await expect(service.editMcq('question',{...dto,options:dto.options.map((option,index)=>index===0?{...option,id:'foreign'}:option)},actor)).rejects.toThrow('does not belong');
  expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
 });
 it('requires exactly one correct choice',async()=>{
  const {service,transaction}=fixture();
  await expect(service.editMcq('question',{...dto,options:dto.options.map(option=>({...option,is_correct:false}))},actor)).rejects.toThrow('exactly one');
  expect(transaction).not.toHaveBeenCalled();
 });
});
