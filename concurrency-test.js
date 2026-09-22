// concurrency-test.js

const SEAT_ID = "cmubs854700095a60dhprelr5"
const EVENT_ID = "cmubo38y900055a605blm8ghf"
const SESSION_COOKIE = "authjs.session-token=e4089159-85d0-4b08-8ace-fe4487d3972c"
const NUM_REQUESTS = 50

async function attemptReserve() {
  const response = await fetch(
    `http://localhost:3000/api/events/${EVENT_ID}/seats/${SEAT_ID}/reserve`,
    {
      method: "POST",
      headers: {
        Cookie: SESSION_COOKIE,
      },
    }
  )
  return response.status
}

async function runTest(){
  const attempts = Array.from({length:NUM_REQUESTS}).map(()=>{
    return attemptReserve()
  })
  const results = await Promise.all(attempts)
  console.log(results)
  const successes = results.filter(status => status === 200).length
  const conflicts = results.filter(status => status === 409).length
  console.log(`Successes: ${successes}, Conflicts: ${conflicts}`)

}

runTest()