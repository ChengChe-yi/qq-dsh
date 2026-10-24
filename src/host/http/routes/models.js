// GET /models → { groups, default, failures }
// provider 分组、每个模型的思考强度、部署默认选择。
import { fail } from '../fail.js';

export function models({ host }) {
  return {
    method: 'GET',
    path: '/models',
    handler: async () => {
      try {
        return { body: { ok: true, ...(await host.modelCatalog()) } };
      } catch (error) {
        return fail(error);
      }
    },
  };
}
