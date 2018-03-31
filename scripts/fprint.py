import sys
import json
import fire
import dumper

import numpy as np

import audfprint.audfprint_match as audfprint_match
import audfprint.audfprint_analyze as audfprint_analyze
import audfprint.hash_table as hash_table

from database import get_database, Database

# DATABASE_CONFIG_FILE = "./database.cnf"
#
# try:
#     with open(DATABASE_CONFIG_FILE) as f:
#         config = json.load(f)
# except IOError as err:
#     print("Cannot open configuration: %s. Exiting" % (str(err)))
#     sys.exit(1)

config = json.loads("""
{
    "database": {
        "host": "contextubot.cao16ctra0vs.us-east-1.rds.amazonaws.com",
        "user": "contextubot",
        "passwd": "Ieleewoughahg6nabee9ahDeghooqu6D",
        "db": "ebdb"
    }
}
""")

db_cls = get_database(config.get("database_type", None))

db = db_cls(**config.get("database", {}))
# db.setup()

def queryHash(hash):
    hash_ = '{:x}'.format(hash)
    # int(str(hash))
    # print(hash_)
    r = np.array(list(db.query(hash_)))
    # print(r)
    if len(r) == 0:
        return r.astype(np.int32)
    else:
        return r.astype(np.int32)

class HashTable(object):
    def __init__(self, filename = None, hashbits = 20, depth = 100, maxtime = 16384):
        self.hashbits = hashbits
        self.depth = depth
        self.maxtimebits = 32 # hash_table._bitsfor(maxtime)
        # allocate the big table
        size = 2 ** hashbits
        self.table = np.zeros((size, depth), dtype=np.uint32)
        # keep track of number of entries in each list
        self.counts = np.zeros(size, dtype=np.int32)
        # map names to IDs
        self.names = []
        # track number of hashes stored per id
        self.hashesperid = np.zeros(0, np.uint32)
        # Empty params
        self.params = {}

    # def get_entry(self, hash_):
    #     """ Return np.array of [id, time] entries
    #         associate with the given hash as rows.
    #     """
    #     vals = self.table[hash_, :min(self.depth, self.counts[hash_])]
    #     maxtimemask = (1 << self.maxtimebits) - 1
    #     # ids we report externally start at 0, but in table they start at 1.
    #     ids = (vals >> self.maxtimebits) - 1
    #     return np.c_[ids, vals & maxtimemask].astype(np.int32)

    def get_hits(self, hashes):
        # Allocate to largest possible number of hits
        nhashes = np.shape(hashes)[0]
        hits = np.zeros((nhashes * self.depth, 4), np.int32)
        nhits = 0
        # maxtimemask = (1 << self.maxtimebits) - 1
        # hashmask = (1 << self.hashbits) - 1
        # Fill in
        for ix in xrange(nhashes):
            # if ix > 5:
            #     break

            # print "- time/hash ------------"
            # print ix
            # print hashes[ix]
            # print "-------------"

            time_ = hashes[ix][0]
            # hash_ = hashmask & hashes[ix][1]
            hash_ = hashes[ix][1]
            # nids = min(self.depth, self.counts[hash_])
            # tabvals = self.table[hash_, :nids]
            tabvals = queryHash(hash_)
            # print "- hits ------------"
            # print tabvals
            # print tabvals.shape
            # print len(tabvals)
            # print "-------------"
            nids = len(tabvals)

            hitrows = nhits + np.arange(nids)
            # Make external IDs start from 0.
            # hits[hitrows, 0] = (tabvals >> self.maxtimebits) - 1
            if nids > 0:
                hits[hitrows, 0] = tabvals[0][0] - 1
            # hits[hitrows, 1] = (tabvals & maxtimemask) - time_
            if nids > 0:
                hits[hitrows, 1] = tabvals[0][1] - time_
            # hits[hitrows, 2] = hash_
            hits[hitrows, 2] = hash_
            # hits[hitrows, 3] = time_
            hits[hitrows, 3] = time_
            nhits += nids
        # Discard the excess rows
        hits.resize((nhits, 4))
        return hits


class Fprint(object):
    def interval(self, input, output, start = 0, end = 0):
        hashes = audfprint_analyze.hashes_load(input)
        filtered = list(filter(lambda h: h[0] >= start and h[0] < end, hashes))

        audfprint_analyze.hashes_save(output, filtered)


    def ingest(self, input, checksum = None):
        hashes = audfprint_analyze.hashes_load(input)
        id = db.insert_song(input, checksum)

        db.insert_hashes(id, hashes)

    def get_song_by_id(self, id):
      print json.dump(db.get_song_by_id(id), indent=2)

    def get_song_num_fingerprints(self, id):
      print db.get_song_num_fingerprints(id)

    def match(self, qry):
        matcher = audfprint_match.Matcher()
        matcher.find_time_range = True
        matcher.verbose = False
        matcher.max_returns = 100
        matcher.db = db

        matcher.exact_count = True
        matcher.max_alignments_per_id = 20

        analyzer = audfprint_analyze.Analyzer()
        analyzer.n_fft = 512
        analyzer.n_hop = analyzer.n_fft/2
        analyzer.shifts = 1
        # analyzer.exact_count = True
        analyzer.density = 20.0
        analyzer.target_sr = 11025
        analyzer.verbose = False

        hash_tab = HashTable("none")
        hash_tab.params['samplerate'] = analyzer.target_sr

        rslts, dur, nhash = matcher.match_file(analyzer, hash_tab, qry, 0)
        t_hop = analyzer.n_hop / float(analyzer.target_sr)
        qrymsg = qry + (' %.1f ' % dur) + "sec " + str(nhash) + " raw hashes"

        # print "duration,start,from,time,source,sourceId,nhashaligned,aligntime,nhashraw,rank,min_time,max_time, t_hop"
        if len(rslts) == 0:
            nhashaligned = 0
        else:
            for (tophitid, nhashaligned, aligntime, nhashraw, rank, min_time, max_time) in rslts:
                    msg = ("{:f},{:f},{:s},{:f},{:s},{:n},{:n},{:n},{:n},{:n},{:n},{:n},{:f}").format(
                            (max_time - min_time) * t_hop, min_time * t_hop, qry,
                            (min_time + aligntime) * t_hop, db.get_song_by_id(tophitid + 1)["song_name"], tophitid + 1, nhashaligned, aligntime, nhashraw, rank, min_time, max_time, t_hop)
                    print msg


if __name__ == '__main__':
  fire.Fire(Fprint)
