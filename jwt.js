const signOptions = {
  algorithm: 'RS256',
};
/**
 * @param {string} token - user token
 * @param {object} data - user data
*/
async function resolve(token) {
  try {
    const data = await jwt.verify(token, JSON.parse(process.env.PUBLIC_KEY), signOptions);
    //await lastSeen.update(data.email);
    return data;
  } catch (err) {
    // eslint-disable-next-line no-console
    // console.log(`logger log. ${err}`);
  }
}
module.exports  = {
  resolve,
}
