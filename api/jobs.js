const RECRUITMENT_API_URL = "https://apis.data.go.kr/1051000/recruitment/list";
const REQUESTS = [
  { recrutSe: "R2010" },
  { recrutSe: "R2020" },
  { hireTypeLst: "R1050,R1060,R1070" },
];
const SENSITIVE_FIELD = /담당|담당자|contact|charger|chrg|manager|phone|tel|mobile|email|e-mail|mail|eml/i;

function removeSensitiveFields(value) {
  if (Array.isArray(value)) return value.map(removeSensitiveFields);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_FIELD.test(key))
        .map(([key, item]) => [key, removeSensitiveFields(item)])
    );
  }
  return value;
}

async function getRecruitments(params, apiKey) {
  const query = new URLSearchParams({
    resultType: "json",
    ongoingYn: "Y",
    pageNo: "1",
    numOfRows: "300",
    ...params,
  });
  const response = await fetch(`${RECRUITMENT_API_URL}?serviceKey=${apiKey}&${query}`);

  if (!response.ok) throw new Error(`채용 API 요청 실패: ${response.status}`);

  const payload = await response.json();
  return payload?.result ?? payload?.response?.body?.items?.item ?? [];
}

module.exports = async function handler(request, response) {
  const apiKey = process.env.RECRUITMENT_API_KEY;

  if (!apiKey) {
    return response.status(500).json({ message: "채용 API 인증키가 설정되지 않았습니다." });
  }

  try {
    const results = await Promise.all(REQUESTS.map((params) => getRecruitments(params, apiKey)));
    const jobs = [];
    const seen = new Set();

    results.flat().forEach((job) => {
      const id = job.recrutPblntSn || `${job.instNm}-${job.recrutPbancTtl}-${job.pbancEndYmd}`;
      if (!seen.has(id)) {
        seen.add(id);
        jobs.push(removeSensitiveFields(job));
      }
    });

    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return response.status(200).json(jobs);
  } catch (error) {
    return response.status(502).json({ message: "채용 공고를 불러오지 못했습니다." });
  }
}
