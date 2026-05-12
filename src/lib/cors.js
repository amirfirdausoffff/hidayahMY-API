export function cors(handler) {
  return async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    return handler(req, res);
  };
}
