const PARTNER_ENDPOINT = 'https://api.convai.com/character/getResponse';
const SAASUNA_PROVISIONAL_JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA4KCw0LCQ4NDA0QDw4RFiQXFhQUFiwgIRokNC43NjMuMjI6QVNGOj1OPjIySGJJTlZYXV5dOEVmbWVabFNbXVn/2wBDAQ8QEBYTFioXFypZOzI7WVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVn/wgARCAEAAJADASIAAhEBAxEB/8QAGgAAAQUBAAAAAAAAAAAAAAAABAABAgMFBv/EABgBAQEBAQEAAAAAAAAAAAAAAAABAgME/9oADAMBAAIQAxAAAAHoQrBdHCHydQuWfYaWhgWHWsJaV5+kPbqW4NEz01V9eKmU7nNBJwtaEZIe2yZU9lWoeRkW1oZhgutEUMOz2hGJqcbK2DZubzPR810kZQvjp1Erl15eWyH0wDV0GWTDuP3kIbayYY/ALTr55mhmi8z2XLambOM5dXe53d57nQXGaxKugjZjw08bpDqtV+nLk1uYUE7XPmS9Ny+nz5XZF5dq0Svn02DBScknjK+D0WB0xrTQVyODAnOgoly7Y6jlety+d5Sdi6Zlt4OjjpuTqt52EoDS25w4nTGwVgbNAiUPi3sM1ndAl85qMN1IZiV0G7msSNz+bqBZ5iDJFBJGwJnXPjPCJNOUdPlEX9+ZKlDy+lCoywXn+kB6c8LoLtdMw9VSkD0gKFm6mal0YPGlrXUXVsqbee4wnBSoRbfK8Zq9SyiGITrgsr2hKo13SLyZZ2p0KCv59bB0JLu2oi8sai3N6QcZ45rpnhPFVY9ThARY9m1AUOaMYN5NUzIk0RlGaW8YSg+LJRcdMh0lWgHCKJJ5U6Rc9DLHXxrLFVqZZJMok8Xp3ZCTPCdOJMhJMRhOJrZZkdBElknjJHdlanZ4Tsh2TDxTCSYvNA2NMR9cXNz3srR3Z7EkpUkw7JDMmHkjBzZQ1Snonz6D42/kXA7s+sOkypnaFJXAthJ60GNLaLWqyqSiTolaYlevmZn/xAAoEAACAgIBBAEEAwEBAAAAAAABAgADERIEEBMhMSIUICMyMDNAQUL/2gAIAQEAAQUCjn5Eyy/SNe7FbzPqmlXKJFTfFvyTkJotbulwfuAYh8/Y7EOzS67EbyZjohwfa1uEnIO9KlO0WsoVrTmGL0c5NtoQE5MEHT0Et+IaPYdXPcs/I0XzVTaLK/cMHmEzlNluldLPGQq2MTOZmBo/kF1j5KAsJxcoO6vQeC0u/fpUoVLaw6lSCibM1ZBxg0n4MpFi0lhntlb/AMq27FR49xx4f3FnHbamXVgkJGrDC1q5WflXO927r9mEpbV+9g7AjkqQLB5gnEfVowyGHy5JslXHbN6avScjTfkOu9briLFbxxG3VxvLVw0WVjUofEx1tXKV+JxcassNOwKlSD5rY1W22CpLW2n/AFfdI2DXimUX937MZFw1voGI7fJ+XqXzYdJ5E5yWZzDFlbfjTjGyqqsVr0BBi+BePKeFv27FY1MJhwwxOcgS/wBT0RKrPiOjDMAxLW8crwBae0Dmcv43Z6Dx05NaObMCL8hOMYvoeQ7aL9RLrtTc+03Of1paw2PmE5mZ6FxGLuJZrUsu1MrOpRxg31JL+aHjnuM2ds+KwtkpcqeRgXdXOs7uLK2l9QwZxyN3XEu8WyjUxgQ9NO8prKpyeLsH/eAQiW3Ayunu2MnbittNE1HDGrZC2ZYgEyirRX4m4prFSM+J3DOavy6sVMo8z3GTMax1ivOUC8+nzKeLhgFSdwYLmEgA8lZdYLK/XXRs0n8eJmOoYV+J/wCZviE5nqWWrWLLWsIPXXoTkEYgYiZB6MYDkdMx20V2Lt0z1zKxYZXaTYPMxPUZpUvxasYPiFpc2W+3PS9xXXXbo++YWMLGZ2dG6cjxa1oh9/fyD8oRohtwDZmdwSnlMk+uWXqWVf2/g5AIsC5jWeCSeq+olmp7VfZ/797tuhf7QYTCfPDs82Lq/wB5O38Nbavyxn/F/bSy6t/g4x88r+3/AAUnFt67V/4E/efTpOw+XQo38mJQvyg6chNk/jAlKbM0JxFPjPS1MN959QIxlVRHTUmdsTUCawrGr2DLg/aIE2i1DImMzUdSBMeB4nuWVloRP//EAB4RAAICAgMBAQAAAAAAAAAAAAABAhEQIBIhMEFQ/9oACAEDAQE/AdLKLxWyJC1o4ldjy8LHG2SH2LDx8zIRQ+h4jKjleJP5rKJVbrt4a3jCn4xbE7G90X+BXg8S1ossvP8A/8QAIhEAAgIBBAIDAQAAAAAAAAAAAAECERASICExMEEDImEy/9oACAECAQE/AVmhxoVs0C3WRkomrklGttmof8kb9CY1RHnEsKVIgKSXA/wZCksex/mPj7H2WR+xDsr0SjZpxFVzsivZH5OeS7yi8taY4ToQ2clZlPUqyhIeyVDVCWXsl2PwPzPwrrwxwtyiUUUNH//EAC0QAAECBAUCBgIDAQAAAAAAAAEAEQIQITESIEFRYSIwAzJAQnGBUrETYpHx/9oACAEBAAY/AkZVTuyu8maqd02iBFky6ZvOiddN1XNVEmkKHU8Y3RAtuV4UTuxl8ppOi90+uZpYbi6iiFASmMbjDqjxVQlw8viYAtOiYqsuZCNn3CwwunMTf13VFo66ixk0jNguUxTbppMqO36RDVhKch3RKxJ4aFfCOQcSf6kIkz9XC4Kp/wBWEhnTxUk6DWQiCprkbQz+UYR5RdCJm4ThEcoxM7KzJ5NsjD7guAovnINcsZ4l8qNGHeYITlGI6z50TXOyNGIyMj8oj7RCw+HDiKeIMVzIRisA0yH8oVjd4ia1QYNOiJWPdQHhHD5kXvPFI4aOhmvLD/qh3Kh/z5l9DK+Hq3VEyaJeZOFZOQvKv7FQleHwo9cIWKK5T5MGqxAPID3CX7XVEsMApqoRDEBCaKpdMV+J5R8OK6OHI+1Viiu64URgvsnQfIXgflF7qzlNEyxeH5gj+srGKiAg0kYcNIrotE6aO6Me8gGqU/uQhE/5BrfI7MFiA6ZOKFMwutlCIfddVsnyOVQEpmrk6n+00qqqwm4QlSdVXJTJWb6hPpkcpzmqukkALCa8id1VV1VJU7OCFA6KGIWndguDIpnr24YdAqKpkxDwq0SxwRONe1WVS5zEaHRRRQC47MOO41TC3YwGxRG3oQVi9EHRB9Cy+vQhPt6EfORj3nycju8CXOTjtUBTm89VdX7darbLZXm+sv/EACUQAQACAgICAgIDAQEAAAAAAAEAESExQVEQYXGBIJEwobHRwf/aAAgBAQABPyGZCcEAo/juUlR6gdpfMNN495mA1NV/yHdDeYjFlQmVXp9Q9kZpGFABWcsFI4T94lypmDUsXluodS1+IlFKwz7gOolRDTiWA6a3BsW+K5hOEG8cwNo4Ht1LQMsbCCyIW+/Bp9bRU2lRe5GINDERE5eQm8SkO+JutmyZ62Mu61/pHIZSuoUOgm2KJg6LUaqDJepgVLb5hUuUGYOpIeEcZ/fqY229R0PEtYmkx4+oK/B9hLIKHQmpuig5mlyqD2Q0BBRzvv3PiJoxW3uEM1DcPQmmM9xKR40HpiBFJFwuS4imoG0gbrmXqY9JFRV9T2Tkgo0F1wzROY3GupnbvwTniH3MHwJ75f8AkS+ogsKUs7R9kMx0Sy2q7imYRv6iGZlVSqa5I4bHJ3KPUc0zZ6iFHQmcHGPK/X/J8WJ6m8cLjtHI+74l/wCwweJhCjcyBqOFBr9EvcsM33Fp9I6fcfLv/Mzp0s/tPyxn8RzNohNX67jZmnD4pZ6iFJRncqijBPSg/wBjunaQGxuAG5hgVGNE4jEcJuYy/uOBj/Y5zdHcXnFdRK8A6HX9iJfqIVd90YC68VPuXMrxqKmStIDwHEFOAW6iqLvCW1VH+5f08RuDlU4je0+agx8RQdtBcJV2FuEKhVQvjxaWupRCJm5sfyuaPfpGpKGMyyoBXrUpAHSQXOfUpzQWnFw5Nf8AkSC1ezTMKz7Cplk8LXIOTuAKJSC7z8IBdmRr1KSlGn0lD1CMG2yY0Rbjv6dkuPlYGbVUzgcw52zUusVQixo8XplBJ9cRZsJfMoiOF+4ndmfUxV9x9DnUWwFsFc8xOt7IZK8K5zHZt4hM2cFgBsHMzfMeU+CMCOb/AHDaV01UIwHqUSs8nmc26Fq2ZBYMX3ArX4loqqY4P3MCQ75gLpWNfEXjw2EOi0GLr7j1BQRtaZhmVukKtJ75xAHphs9kTMO9TVocWyirfqJWwL1mcBZQiL6pW3o8y4znR4HqukMX3NYNlqUcgEDI2b9RZQuse4bDlsspIuGNvcVI2x8RTuboSzdAzbxy9sHEyxmdArT5QJdEuMv7KBDS0uCcpsPtlIrKXfUZ0Pafeo6JfdQ0EOy2GoDwTiREdKAcsufaajQKAi5fUs5UYJdYmTZh7mHT3KEPuBH2nZE+64BzGoOEZ2srliXnbg7l/wADg6manwg7jfb6ZSOcMUs2cSk1r1NIsgTD9TJrUHTHf/kx7PCLFi+ILZHj3FDX5PC5RKNz5iC8T3r0kpCWNiLamlZZ3XUdwsdkdxIeq8H434XBHVl/2GodGoCwydkG4b+Y7eJ6p5YSCODHhlCAsQVv87lgDB4rj/pMYLfcsbp8sA+nbJpC73H9x+0GE5f4KIc1GeI9cEVFM+dEQnNuB7Esrrheos3+ZUFftE4moc/hi8OxLbv/AFnu9U5/N1b+VxYz18wKHY19TcP5nwARffuJuR/Mx8Z71uUp8L8P8i+br9T2OQiY/jX8Dph/pxLBqy/epRWiu7lQa6/ifG2ELlMcQixLmTO0/hPPZMoww1M7mLR4LLKtsn8RQWvqC4bcdSqNkeR+oXXaYaTJb28GI54iIJSfkIwu6hLP4S9cD3PtO4BxM6GcZbjiqReAql3ea6uXwJjSenh//9oADAMBAAIAAwAAABCZ+qNHmuMW8zdPK53RRxaRmkOD+vvbuQLzFte5T5WZ4efrqtgWnuxAlTfSRlYRhJEZ06tEShqrOg+toNkhPVqtu1v0kox9iYoobTtaG2xD6iQrM+NIg7uSKJZab1nqHqYZI1oIfkTbo/Q5obX/xAAeEQEBAQADAQADAQAAAAAAAAABABEQITEgQEFhUf/aAAgBAwEBPxCXgYDwcOTPPHN4yWkd8lpw8dJe5h4WfHgeXnh7C9XV0tj+2vGLWxanSBzW21jeLCdxX/Lxb1vCSodMIfEWzj7P+S5hGGTa/qfhokdGQsn6gs+H02Rs6l7l+ReM0yJ4PjxCPOMkfkM538QNclkmfQbDHgfv4DYB7OfJ17atXj//xAAeEQEBAQEAAwADAQAAAAAAAAABABEhECAxMEFRYf/aAAgBAgEBPxAfuyGQy9ET/sJFHkrcvh4E3L5d/bR2wtyRcmTkXRjZEW6LTsRezqeMfA7sOXAzs94zLixuwaQ0/uTtg4bG+QtTDHkgZ+5R6x4SixvuT9fAo6eIXV7LYMAcbVjZ8EiT3sq5LewnyVcgH2f88HweRywlnoU9j+LZtyPmy76duw22wmbPotfQZMfw9G/h+kPvt0e7F+QZ2AfLNj+WF//EACcQAQACAgIBAwQDAQEAAAAAAAEAESExQVFhcYGREKGxwSDR8OHx/9oACAEBAAE/EFpALXRLiOHHpBaSW6gStpXfpOPdiKhYOVeszc4o2t0oPvKjIst/Zb9mJ2IstVjm9PrPCSKa94yignKeSVmVI1WPMCqFMt8SxUdVuX0l6c7HpiQDeD5lAR3LjmK7CgfuVMFsh95i22pweUl/BZVyylLy+0c6MplX6LLzmw1/UAVV0Zx09niPdzazB4/39QgFshkOB94bgFG4eC4afTxAk0DZayJ39sXHfYC105/P0G16vB4YibzU2iugcIREig4feWZlu4YxzNrYFWzTkygJtdvxHbyfCdk2KAwQSaigtUEsfk+ZaYgcA6l/V7OgLPwQ0FWsc3uDG6a7KrOI2rD+oAHOp/TBEcw3cg5BjgLlbKz/AL8zNt9CJWdy/soZeCVp4sBhJVwKNOIyVtilCtL2REqqs+HiG3bSa7j1jnG1TvqrcQiVhlaDF417w0KKqHftGnWHHJf6jUuestZ8RAKCqRodxXpy0wVcCBbbMGUqa6zHr0hsXAu4AmO+/McCVmgV6LUKsL8CX4dS3lqRiY1bjww98efeGqGU3Bdr1n7zMAzgD49QzxKuuX8b/wB5jloQH1RgrqVBrMuyP+4YkIlnB8nHtDSJxO6llxG6PEweq4DipZeSx5jKN/YtfaBEkAZPXb5xNKLGsmSBxlkq32+5UOBrNKKFc38R+9lipjzbBWimKYurMvBvgeM8xYYWAqsbriDdYhQujHQ5IXRVHHBFA4fU5EvdisOFgglDYvAROGMl1i/A/r3lQ3jNk9TJL2WinlgxWvoWWB78e7MK0YtXhdrxvEKrpr1bf9xAqOB6sjSk6QLvD+YTLwKHVKX0uHuYq0LClNeYp2lhTv8A8MNwGTuOnsjuuwf54L93xKzZsPWh/ZKyILA9ygluF6Lx6VCFaHlPD6dyrJkEumI9SGIrcqAAFAQnC2qwi2Fme8/3BdQnWq2fM3RaGNOH73FokaNlbz2QVrdCC7Uw7NfshFr4G7Aws7aPa6liAAxgOMHpUueoQHmXIaa/A9bzLhFem8+uoPaikXEaFxPoo3An0Db+A94OrDQccx1XAZcZu/uRs0KJ8krpDtAfBtlg1wIB8MWV0tnQgSk8l9mbgFBl8r/fiMHYss4rcsoeQ+HUCwWoR8xHpV/EFVRObbB5cbgDBlWUveYhsl9fREBZTWosTgWviJO1Vdc/hJiXL9uk/cTZ7LKW04U9peG3AZO4twRhHZW+RmYLtlU8/M2nl7I0GCUoLg9YqKyH7tylvI89zaVJgd+ISJJpIj1CVIgjpIErYXdB90BhRDpRdnXA94NSsL54D6w4y1qc7H21GAChg8xVM16m7/BHv1lKnMRkb3OmIC2LOAyQOLiswHBeJp8Cl+I28BWe4pz4KI9Z0y8Nau+3/fMYSvCyDh5mEy9EoZ3SmvtNvEWcH+4qcSnLiM3Vj6Dn8MNzvQv8YgRWCjVBg+CG4AIy3R1A1GEyK24Hl1FxuKrtV5lD4rsD7f1FQJQrvoD+4OFmpphOvWCQ0AwqMKaLQrR+mV9A4jlRhDT6COCFhhsbusBUOapa94c31GidqrqPjJxZ64+EsCugmkaP6+IziqngKLi0RmsZYLiPxBN+AZuij8xPtux3S9EGiGwhs0CD5rzvEQXZcY11GuAFa+FKjaj1CwYjFFJQxXUqstEJLBbsBdWS+8Mh64g61taj1Y734/A3j4iCu0XDXB1+IwKYUU8T5hYv4mfP7Irm796hUhigb6KHW/WoeC17CJjygLl9YdbTYcqMAoKVfY6Z3JQIrGf9cHoGGuwc/aXUXcE1oQSApwc3OzGcXmKWj3T4WZSNufsjT+kJfwh7QwC2o8MMur4lCDiNsy4/cCM+ruUGTKm2Z0tWHshLANDnwxkqLNsf5zClzVBqOBQDTwVZ6thDUwVwz15fMM8xE0xYlLi3bKqFU75jtjX6m1CyYh2FdqtBfbCD4YgpER5m4OzbFOkTG/oU+CDQUagcXv8AcSLI8OfXuCoVXTT/AFFnphslgLMr24+2n27heSxnoFlysAAidTMWZ4cssXlp3F5qdev+vMXI3zGoDQH1hq8nye8VgocMtgV5bv3lgO9pgj3iEV5Ln/sTUPa38QdCxx16SndtAKs59x+oTNYCujz5+mcY0KiTdBdogJMqVLjO5f0OHLh5JeNKXhF/aNTchhKNrezEIWZDZyes3xT2TPCx3mI1R4AIaRTxel/fMVejLwyuNBpHiXsMy/bYN/P0PpdQkEAynLhzN7errwXE5YPKp6l3aamR3kmEQ6H7guo5lc4phoc5YFhAqWVc8dhfWomF09ZuF1j63L+lyxDE0mD/AHrOa5YYMBte3cH1CYkO6/0GD2hU4tWIfebjT0O5rKsVSj75jY7y3R7v/VHFe5fzRZcuX/B24qc+TjxKIMG10QgoALKPWpYn7QIEXxR9KF1uOoVlzjmPXzEy0W68M1TdOM1KF19Fy/qP0zepG+agCvaElAolWwPoQSrBCMobuycNJQ6pn5PxFRyvbs4YNZaiVrUGXLg/S+t9HB9DcD64S4+ly3W/eGcifKyfH7mkVlOyagwh/AP4uoI7iErsabBiBXT0+fMIwYfxP4XFFEjiTbT03EnNrfJhBUIMPqQly5cX6DGOFyvyJpWpPS6T/dRHmK4FwhD+Ny4v0Dti1DLUdMKgX5jwlCrTxGkHGOEb6eyqN8hlGk8fQ/jcX6UHMvlgYI+2aZap5g20nNQEekRUshv3o5P919D+Ky4OWLleX7S7j3fwiifM3y8EoR4QqgwUF/eAoePq8W/ZOz+TAtqCqcuImam4JkSLQEKwun4uGAYjKtRQxDd5QSbG7ZbCN8tkCrEPij5nQe9sBmpsl0y/EqT6sYzmimsGDF3MIo0DHvAg12V+oAILpVz6Thl9sKFjxgxERDrrROWDriZ8NAXD/UFJ5IFV2PrArAmKVZ1GFwiNI8T/2Q==';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function exactToken(value, max = 256) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text !== value || text.length > max || /[\r\n]/.test(text)) return null;
  return text;
}

function userText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 4000) return null;
  return text;
}

async function handlePartnerConversation(context, request) {
  const apiKey = exactToken(context?.env?.CONVAI_API_KEY, 512);
  const characterId = exactToken(context?.env?.CONVAI_SAASUNA_CHARACTER_ID);
  if (!apiKey || !characterId) {
    return json({ ok: false, state: 'not_configured' }, 503);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ ok: false, state: 'invalid_request' }, 400);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return json({ ok: false, state: 'invalid_request' }, 400);
  }

  const message = userText(input.userMessage);
  const providerSessionId = input.providerSessionId == null ? null : exactToken(input.providerSessionId);
  if (!message || (input.providerSessionId != null && !providerSessionId)) {
    return json({ ok: false, state: 'invalid_request' }, 400);
  }

  const form = new FormData();
  form.set('userText', message);
  form.set('charID', characterId);
  form.set('sessionID', providerSessionId ?? '-1');
  form.set('voiceResponse', 'false');

  const upstreamFetch = typeof context?.fetch === 'function' ? context.fetch : fetch;
  let upstream;
  try {
    upstream = await upstreamFetch(PARTNER_ENDPOINT, {
      method: 'POST',
      headers: { 'CONVAI-API-KEY': apiKey },
      body: form,
    });
  } catch {
    return json({ ok: false, state: 'provider_unavailable' }, 502);
  }
  if (!upstream?.ok) return json({ ok: false, state: 'provider_unavailable' }, 502);

  let payload;
  try {
    payload = await upstream.json();
  } catch {
    return json({ ok: false, state: 'provider_invalid' }, 502);
  }

  const responseCharacterId = exactToken(payload?.charID);
  const responseText = typeof payload?.text === 'string' ? payload.text.trim() : '';
  const responseSessionId = exactToken(payload?.sessionID);
  if (responseCharacterId !== characterId || !responseText || responseText.length > 800 || !responseSessionId) {
    return json({ ok: false, state: 'provider_invalid' }, 502);
  }

  return json({
    ok: true,
    text: responseText,
    providerSessionId: responseSessionId,
  });
}

function provisionalVisualResponse() {
  const binary = atob(SAASUNA_PROVISIONAL_JPEG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'no-store',
      'x-gameroad-asset-role': 'provisional-static',
    },
  });
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const isWebSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

  if (!isWebSocket && request.method === 'GET' && url.searchParams.get('partnerOp') === 'visual') {
    return provisionalVisualResponse();
  }

  if (!isWebSocket && request.method === 'POST') {
    const partnerOp = url.searchParams.get('partnerOp') || '';
    if (partnerOp === 'conversation') return handlePartnerConversation(context, request);

    const matchOp = url.searchParams.get('matchOp') || '';
    if (matchOp === 'create' || matchOp === 'status' || matchOp === 'cancel') {
      const queue = url.searchParams.get('queue') || '';
      if (!/^[A-Za-z0-9._:-]{8,160}$/.test(queue)) {
        return new Response('Invalid normal-match queue', { status: 400 });
      }
      const id = context.env.GAMEROAD_ROOMS.idFromName(`gameroad.normal.${queue}`);
      return context.env.GAMEROAD_ROOMS.get(id).fetch(request);
    }
  }

  if (!isWebSocket) {
    return new Response('WebSocket upgrade required', { status: 426, headers: { Upgrade: 'websocket' } });
  }
  const channel = url.searchParams.get('channel') || '';
  if (!channel || channel.length > 192) return new Response('Invalid channel', { status: 400 });
  const id = context.env.GAMEROAD_ROOMS.idFromName(channel);
  return context.env.GAMEROAD_ROOMS.get(id).fetch(request);
}
